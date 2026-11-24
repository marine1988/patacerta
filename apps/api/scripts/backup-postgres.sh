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
#   5   objecto criado mas com tamanho abaixo do minimo (dump truncado/vazio)
# ──────────────────────────────────────────────────────────────────────────
set -eu

# ── Guard de tamanho do objecto ──
# Um dump real desta app ronda os 150 KB (medido no offsite: 136-154 KB em 92
# dias consecutivos, mediana 153,5 KB). Abaixo de 4 KB so' cabe o header `age`
# de um dump que morreu a meio do pipeline — foi exactamente o que passou a
# 2026-08-25 (`postgres-2026-08-25_135207.dump.age`, 200 B): pg_dump falhou, o
# `age` fechou o header na mesma e o `mc pipe` gravou os 200 B que recebeu. O
# guard antigo (100 B) aceitava esse lixo, o objecto era mirrorizado para o
# offsite e o dead-man-switch pingava SUCESSO — um dia de backups "verde" sem
# conteudo. Anomalia detectada na auditoria AUDIT-OPS.md (OPS-08).
#
# Porque NAO validamos o TOC com `pg_restore --list`: o dump sai encriptado em
# streaming (`pg_dump | age -r ... | mc pipe`) e a chave PRIVADA vive offline
# por desenho (docs/BACKUP.md §1). Desencriptar aqui exigiria a chave no
# servidor, que e' precisamente o que a arquitectura evita. O tamanho do
# objecto e' o melhor sinal barato que o servidor consegue avaliar sozinho
# (o drill trimestral, com a chave na mao, e' que valida o conteudo).
MIN_BACKUP_BYTES=4096

# Devolve 0 se o tamanho for plausivel, 1 caso contrario.
check_backup_size() {
  _size="${1:-}"
  # mc stat pode devolver vazio (objecto inexistente) ou algo nao-numerico.
  case "$_size" in
    '' | *[!0-9]*) _size=0 ;;
  esac
  [ "$_size" -ge "$MIN_BACKUP_BYTES" ]
}

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

# pg_dump NAO aceita os query params especificos do Prisma no URI
# (schema, connection_limit, pool_timeout, connect_timeout, socket_timeout) e
# aborta com "invalid URI query parameter: schema". Removemos a query string —
# pg_dump faz dump da BD inteira (schema public por defeito).
PG_DSN="${DATABASE_URL%%\?*}"

if ! pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --compress=6 \
    --dbname="$PG_DSN" \
  | age -r "$AGE_RECIPIENT" \
  | mc pipe "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${OBJECT_PATH}"
then
  echo "[backup-pg] FATAL: pipeline pg_dump|age|mc falhou" >&2
  exit 2
fi

# ── Verificacao: objecto existe e tem tamanho plausivel ──
SIZE=$(mc stat --json "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${OBJECT_PATH}" 2>/dev/null | grep -o '"size":[0-9]*' | head -1 | cut -d: -f2)
if ! check_backup_size "${SIZE:-}"; then
  echo "[backup-pg] FATAL: backup criado mas tamanho suspeito: ${SIZE:-0} bytes (minimo ${MIN_BACKUP_BYTES}) -> ${OBJECT_PATH}" >&2
  echo "[backup-pg] O objecto foi criado (o pipeline nao devolveu erro) mas nao tem conteudo plausivel." >&2
  echo "[backup-pg] Investigar pg_dump/age no log acima; o objecto fica no bucket como evidencia." >&2
  exit 5
fi

SIZE_HUMAN=$(awk "BEGIN { printf \"%.2f MiB\", $SIZE/1024/1024 }")
echo "[backup-pg] $(date -u +%FT%TZ) sucesso (${SIZE} bytes / ${SIZE_HUMAN}, minimo ${MIN_BACKUP_BYTES}) -> ${OBJECT_PATH}"

hc_ping ""
trap - EXIT
exit 0
