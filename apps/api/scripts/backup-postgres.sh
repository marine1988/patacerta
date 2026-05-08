#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# backup-postgres.sh
#
# Faz pg_dump da BD Postgres, encripta com age (chave publica), e envia
# para o bucket de backups no MinIO local. Naming GFS-friendly para a
# rotacao posterior identificar qual o tier.
#
# Pipeline:
#   pg_dump --format=custom (binario, suporta pg_restore) | age -r $RECIPIENT | mc pipe
#
# Sem ficheiro intermedio em disco — streaming end-to-end (memoria-eficiente
# e nao deixa rastos de plaintext no filesystem do container).
#
# Naming:
#   postgres/YYYY/MM/postgres-YYYY-MM-DD_HHMMSS.dump.age
#
# Variaveis de ambiente necessarias (vindas do compose):
#   DATABASE_URL              — PG connection string (parsed para extrair host/db/user/pass)
#   AGE_RECIPIENT             — chave publica age (age1...) para encriptar
#   MINIO_ENDPOINT            — host MinIO (e.g. "minio")
#   MINIO_PORT                — porta (e.g. "9000")
#   MINIO_ACCESS_KEY          — user S3
#   MINIO_SECRET_KEY          — password S3
#   MINIO_BACKUP_BUCKET       — nome do bucket de backups (default: patacerta-backups)
#
# Opcionais:
#   HEALTHCHECKS_URL_BACKUP   — URL Healthchecks.io para ping start/success/fail
#
# Exit codes:
#   0   sucesso
#   1   variavel obrigatoria em falta
#   2   pg_dump falhou
#   3   encrypt falhou
#   4   upload MinIO falhou
# ──────────────────────────────────────────────────────────────────────────
set -eu

# ── Validacoes ──
: "${DATABASE_URL:?[backup-pg] FATAL: DATABASE_URL nao definida}"
: "${AGE_RECIPIENT:?[backup-pg] FATAL: AGE_RECIPIENT nao definida (chave publica age)}"
: "${MINIO_ENDPOINT:?[backup-pg] FATAL: MINIO_ENDPOINT nao definida}"
: "${MINIO_PORT:?[backup-pg] FATAL: MINIO_PORT nao definida}"
: "${MINIO_ACCESS_KEY:?[backup-pg] FATAL: MINIO_ACCESS_KEY nao definida}"
: "${MINIO_SECRET_KEY:?[backup-pg] FATAL: MINIO_SECRET_KEY nao definida}"

MINIO_BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-patacerta-backups}"
HC_URL="${HEALTHCHECKS_URL_BACKUP:-}"

# ── Healthchecks ping start ──
hc_ping() {
  if [ -n "$HC_URL" ]; then
    wget -q -O /dev/null --timeout=10 "$HC_URL$1" 2>/dev/null || true
  fi
}
hc_ping "/start"

# ── Trap para reportar falha ──
trap 'rc=$?; if [ $rc -ne 0 ]; then echo "[backup-pg] FALHOU com exit $rc" >&2; hc_ping "/fail"; fi; exit $rc' EXIT

# ── Setup mc alias ──
MC_ALIAS="local"
mc alias set "$MC_ALIAS" "http://${MINIO_ENDPOINT}:${MINIO_PORT}" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null

# Garantir bucket existe (idempotente — ignora se ja existe)
mc mb --ignore-existing "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}" >/dev/null

# ── Naming ──
TIMESTAMP=$(date -u +%Y-%m-%d_%H%M%S)
YEAR=$(date -u +%Y)
MONTH=$(date -u +%m)
OBJECT_PATH="postgres/${YEAR}/${MONTH}/postgres-${TIMESTAMP}.dump.age"

echo "[backup-pg] $(date -u +%FT%TZ) inicio backup -> ${MINIO_BACKUP_BUCKET}/${OBJECT_PATH}"

# ── Pipeline: pg_dump | age | mc pipe ──
# pg_dump --format=custom (-Fc) cria dump binario comprimido, restauravel
# com pg_restore (suporta restore parcial, paralelo, etc). E' o formato
# preferido para backups de producao.
#
# --no-owner / --no-privileges: torna o dump portavel entre clusters
# (util se restaurares para um servidor diferente com user diferente).
#
# Usamos pipefail logico via verificacao manual de PIPESTATUS-like (sh
# nao tem PIPESTATUS, mas com `set -o pipefail` em ash isto funciona).
set -o pipefail 2>/dev/null || true

if ! pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --compress=6 \
    --dbname="$DATABASE_URL" \
  | age -r "$AGE_RECIPIENT" \
  | mc pipe "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${OBJECT_PATH}"
then
  echo "[backup-pg] FATAL: pipeline pg_dump|age|mc falhou" >&2
  exit 2
fi

# ── Verificacao: ficheiro existe e tem tamanho > 0 ──
SIZE=$(mc stat --json "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${OBJECT_PATH}" 2>/dev/null | grep -o '"size":[0-9]*' | head -1 | cut -d: -f2)
if [ -z "$SIZE" ] || [ "$SIZE" -lt 100 ]; then
  echo "[backup-pg] FATAL: backup criado mas tamanho suspeito (${SIZE:-0} bytes)" >&2
  exit 4
fi

SIZE_HUMAN=$(awk "BEGIN { printf \"%.2f MiB\", $SIZE/1024/1024 }")
echo "[backup-pg] $(date -u +%FT%TZ) sucesso (${SIZE_HUMAN}) -> ${OBJECT_PATH}"

hc_ping ""
trap - EXIT
exit 0
