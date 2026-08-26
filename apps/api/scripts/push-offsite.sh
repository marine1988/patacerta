#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# push-offsite.sh  (Backups — Fase B: offsite)
#
# Espelha o bucket de backups LOCAL (patacerta-backups) para um destino
# S3-compativel EXTERNO (Cloudflare R2, Backblaze B2, MinIO Unraid, etc.),
# dando uma copia OFFSITE. Mitiga o risco "backups no mesmo servidor" da
# Fase A (se o servidor morrer, os backups locais morrem com ele).
#
# Os ficheiros ja' saem ENCRIPTADOS com age (.age) da Fase A — o destino
# offsite so' recebe blobs encriptados, por isso pode ser um provider
# nao-confiavel/gratuito sem risco de exposicao de dados.
#
# Estrategia: mc mirror --overwrite (incremental, so' novos/alterados).
# NAO usa --remove: o offsite ACUMULA (retencao offsite >= local). Com
# backups pequenos e 10GB de free tier isto dura muito; adicionar rotacao
# offsite mais tarde se necessario.
#
# Vars necessarias (definir no Dokploy → Environment do serviço cron):
#   OFFSITE_ENDPOINT     — URL S3 do destino (ex R2: https://<acct>.r2.cloudflarestorage.com)
#   OFFSITE_ACCESS_KEY   — Access Key ID (token com WRITE)
#   OFFSITE_SECRET_KEY   — Secret Access Key
#   MINIO_ENDPOINT/PORT/ACCESS_KEY/SECRET_KEY — MinIO local (source)
#
# Opcionais:
#   OFFSITE_BUCKET             (default: patacerta-backups-offsite)
#   MINIO_BACKUP_BUCKET        (default: patacerta-backups)
#   HEALTHCHECKS_URL_OFFSITE   — dead-man-switch
#
# Exit: 0 sucesso (ou skip se offsite nao configurado), 1 config local, 2 mirror
# ──────────────────────────────────────────────────────────────────────────
set -eu

# ── Se o offsite nao estiver configurado, sair 0 (nao e' erro; ex: stage) ──
if [ -z "${OFFSITE_ENDPOINT:-}" ] || [ -z "${OFFSITE_ACCESS_KEY:-}" ] || [ -z "${OFFSITE_SECRET_KEY:-}" ]; then
  echo "[push-offsite] OFFSITE_* nao configurado — a saltar (sem copia offsite)."
  exit 0
fi

# ── Validacoes do source local ──
: "${MINIO_ENDPOINT:?[push-offsite] FATAL: MINIO_ENDPOINT nao definida}"
: "${MINIO_PORT:?[push-offsite] FATAL: MINIO_PORT nao definida}"
: "${MINIO_ACCESS_KEY:?[push-offsite] FATAL: MINIO_ACCESS_KEY nao definida}"
: "${MINIO_SECRET_KEY:?[push-offsite] FATAL: MINIO_SECRET_KEY nao definida}"

MINIO_BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-patacerta-backups}"
OFFSITE_BUCKET="${OFFSITE_BUCKET:-patacerta-backups-offsite}"
HC_URL="${HEALTHCHECKS_URL_OFFSITE:-}"

hc_ping() {
  if [ -n "$HC_URL" ]; then
    wget -q -O /dev/null --timeout=10 "$HC_URL$1" 2>/dev/null || true
  fi
}
hc_ping "/start"

trap 'rc=$?; if [ $rc -ne 0 ]; then echo "[push-offsite] FALHOU com exit $rc" >&2; hc_ping "/fail"; fi; exit $rc' EXIT

# ── Aliases mc: local (source) + offsite (destino) ──
mc alias set localbk "http://${MINIO_ENDPOINT}:${MINIO_PORT}" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
mc alias set offsite "$OFFSITE_ENDPOINT" "$OFFSITE_ACCESS_KEY" "$OFFSITE_SECRET_KEY" >/dev/null

echo "[push-offsite] $(date -u +%FT%TZ) mirror localbk/${MINIO_BACKUP_BUCKET} -> offsite/${OFFSITE_BUCKET}"

# mirror incremental. --overwrite garante update de objectos alterados.
if ! mc mirror --overwrite "localbk/${MINIO_BACKUP_BUCKET}" "offsite/${OFFSITE_BUCKET}"; then
  echo "[push-offsite] FATAL: mc mirror para offsite falhou" >&2
  exit 2
fi

# Contagem simples para log
OFF_COUNT=$(mc ls --recursive "offsite/${OFFSITE_BUCKET}" 2>/dev/null | wc -l)
echo "[push-offsite] $(date -u +%FT%TZ) sucesso — ${OFF_COUNT} objectos no offsite (${OFFSITE_BUCKET})"

hc_ping ""
trap - EXIT
exit 0
