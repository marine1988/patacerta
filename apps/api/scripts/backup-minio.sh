#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# backup-minio.sh
#
# Faz snapshot do bucket de uploads dos utilizadores (fotos breeders/
# services), encripta com age, envia para o bucket de backups.
#
# Estrategia:
#   1. mc mirror para um diretorio temporario local (/tmp/minio-backup-XXX)
#   2. tar -c | age -r | mc pipe (streaming)
#   3. cleanup do temp dir
#
# Porque tar-and-encrypt em vez de file-by-file mirror?
#   - Atomicidade: 1 ficheiro = 1 estado consistente. Restore e' "extrair
#     1 tar" em vez de "sincronizar N ficheiros".
#   - Encriptacao: age e' stream-cipher, encripta 1 stream de cada vez.
#     File-by-file requer N invocacoes (lento + N chaves).
#   - Versioning: 1 tar.age por dia, fácil aplicar GFS.
#
# Trade-off: requer espaco em /tmp para a copia + compress (vai a disco
# uma vez). Para ~1GB de uploads isto e' aceitavel. Se o bucket crescer
# muito (>10GB), considerar mc mirror incremental directo para outro
# bucket de versionado.
#
# Naming:
#   minio/YYYY/MM/minio-uploads-YYYY-MM-DD_HHMMSS.tar.age
#
# Vars necessarias:
#   AGE_RECIPIENT, MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY,
#   MINIO_SECRET_KEY, MINIO_BUCKET (uploads source)
#
# Opcionais:
#   MINIO_BACKUP_BUCKET (default: patacerta-backups)
#   HEALTHCHECKS_URL_BACKUP_MINIO
#
# Exit codes:
#   0 sucesso, 1 config, 2 mirror, 3 tar+encrypt+upload, 4 verificacao
# ──────────────────────────────────────────────────────────────────────────
set -eu

: "${AGE_RECIPIENT:?[backup-minio] FATAL: AGE_RECIPIENT nao definida}"
: "${MINIO_ENDPOINT:?[backup-minio] FATAL: MINIO_ENDPOINT nao definida}"
: "${MINIO_PORT:?[backup-minio] FATAL: MINIO_PORT nao definida}"
: "${MINIO_ACCESS_KEY:?[backup-minio] FATAL: MINIO_ACCESS_KEY nao definida}"
: "${MINIO_SECRET_KEY:?[backup-minio] FATAL: MINIO_SECRET_KEY nao definida}"
: "${MINIO_BUCKET:?[backup-minio] FATAL: MINIO_BUCKET (uploads bucket) nao definida}"

MINIO_BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-patacerta-backups}"
HC_URL="${HEALTHCHECKS_URL_BACKUP_MINIO:-}"

hc_ping() {
  if [ -n "$HC_URL" ]; then
    wget -q -O /dev/null --timeout=10 "$HC_URL$1" 2>/dev/null || true
  fi
}
hc_ping "/start"

# Temp dir — limpamos sempre, mesmo em falha
TEMP_DIR=$(mktemp -d -t minio-backup-XXXXXX)
trap 'rc=$?; rm -rf "$TEMP_DIR"; if [ $rc -ne 0 ]; then echo "[backup-minio] FALHOU com exit $rc" >&2; hc_ping "/fail"; fi; exit $rc' EXIT

MC_ALIAS="local"
mc alias set "$MC_ALIAS" "http://${MINIO_ENDPOINT}:${MINIO_PORT}" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
mc mb --ignore-existing "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}" >/dev/null

TIMESTAMP=$(date -u +%Y-%m-%d_%H%M%S)
YEAR=$(date -u +%Y)
MONTH=$(date -u +%m)
OBJECT_PATH="minio/${YEAR}/${MONTH}/minio-uploads-${TIMESTAMP}.tar.age"

echo "[backup-minio] $(date -u +%FT%TZ) mirror ${MINIO_BUCKET} -> tmp"

# 1. Mirror bucket para temp local. --quiet evita ruido de N ficheiros.
# Se o bucket nao existir ou estiver vazio, mc mirror nao falha (cria 0
# ficheiros) — comportamento aceitavel para primeiros dias do MVP.
if ! mc mirror --quiet --overwrite "${MC_ALIAS}/${MINIO_BUCKET}" "$TEMP_DIR/uploads"; then
  echo "[backup-minio] FATAL: mc mirror falhou" >&2
  exit 2
fi

FILE_COUNT=$(find "$TEMP_DIR/uploads" -type f 2>/dev/null | wc -l)
echo "[backup-minio] $(date -u +%FT%TZ) mirror OK (${FILE_COUNT} ficheiros), a empacotar+encriptar+enviar"

# 2. tar -c -C $TEMP_DIR uploads | age | mc pipe
# Usar -C para gravar paths relativos a "uploads/" no tar — facilita
# o restore (tar -x extrai para CWD/uploads).
set -o pipefail 2>/dev/null || true

if ! tar -c -C "$TEMP_DIR" uploads \
  | age -r "$AGE_RECIPIENT" \
  | mc pipe "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${OBJECT_PATH}"
then
  echo "[backup-minio] FATAL: pipeline tar|age|mc falhou" >&2
  exit 3
fi

# 3. Verificar tamanho
SIZE=$(mc stat --json "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${OBJECT_PATH}" 2>/dev/null | grep -o '"size":[0-9]*' | head -1 | cut -d: -f2)
if [ -z "$SIZE" ] || [ "$SIZE" -lt 50 ]; then
  echo "[backup-minio] FATAL: backup criado mas tamanho suspeito (${SIZE:-0} bytes)" >&2
  exit 4
fi

SIZE_HUMAN=$(awk "BEGIN { printf \"%.2f MiB\", $SIZE/1024/1024 }")
echo "[backup-minio] $(date -u +%FT%TZ) sucesso (${SIZE_HUMAN}, ${FILE_COUNT} ficheiros) -> ${OBJECT_PATH}"

hc_ping ""
trap 'rm -rf "$TEMP_DIR"' EXIT
exit 0
