#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# cron-entrypoint.sh
#
# Arranca crond (busybox) com os jobs do PataCerta:
#  - expire-sponsored-slots:  horario (minuto 0 de cada hora)
#  - cleanup-refresh-tokens:  diario 03:00 UTC
#  - backup-postgres + backup-minio: diario 02:00 UTC
#  - rotate-backups:          diario 02:30 UTC
#
# Logs:
#  - busybox crond escreve para stderr quando corrido com `-f -l 8`.
#  - Os jobs em si redirecionam stdout/stderr para /proc/1/fd/1 (PID 1
#    deste container e' o crond), garantindo que os logs aparecem em
#    `docker logs` / Dokploy console em vez de mailbox local.
#
# Variaveis de ambiente herdadas (vindas do compose):
#  - DATABASE_URL: usado pelos jobs node E pelo backup-postgres.sh
#  - MINIO_*: usado pelos backups (mc + mirror do bucket uploads)
#  - AGE_RECIPIENT: chave publica para encriptar backups
#  - HEALTHCHECKS_URL_*: opcional, dead-man-switch
#
# Failsafe:
#  - DATABASE_URL e' obrigatoria (jobs node E backup-postgres dependem).
#  - Outras vars de backup sao validadas pelos proprios scripts (vao
#    falhar com mensagem clara se faltarem). Isto permite deploy parcial
#    (ex: subir cron antes de configurar AGE_RECIPIENT) sem partir o
#    container — so' os jobs de backup falham, os outros continuam.
# ──────────────────────────────────────────────────────────────────────────
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[cron] FATAL: DATABASE_URL nao definida. A abortar." >&2
  exit 1
fi

# ──────────────────────────────────────────────────────────────────────
# Env-passing para jobs cron.
#
# busybox crond (ao contrario do vixie/cronie) NAO herda o environment
# do processo pai para os jobs. Os jobs arrancam com PATH minimo e sem
# DATABASE_URL/MINIO_*/AGE_RECIPIENT etc. Solucao standard:
#   1. Dump o env actual para /app/.cron.env (formato shell-source-able)
#   2. Cada cron entry faz `. /app/.cron.env` antes de correr o script
#
# Cuidado:
#   - Filtrar variaveis problematicas (PWD, OLDPWD, _) — sem efeito mas
#     poluem.
#   - Escapar valores com aspas duplas para sobreviver a espacos/$/etc.
#   - Ficheiro com 600 (contem secrets: DATABASE_URL, AGE keys, MINIO_SECRET).
# ──────────────────────────────────────────────────────────────────────
ENV_FILE=/app/.cron.env
{
  printenv | while IFS='=' read -r key value; do
    case "$key" in
      PWD|OLDPWD|_|SHLVL|HOME|HOSTNAME|TERM) continue ;;
    esac
    # Escape: substituir " por \" no valor
    escaped=$(printf '%s' "$value" | sed 's/"/\\"/g')
    printf 'export %s="%s"\n' "$key" "$escaped"
  done
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "[cron] Env dump escrito em $ENV_FILE ($(wc -l < "$ENV_FILE") vars)"

CRON_FILE=/var/spool/cron/crontabs/root
mkdir -p /var/spool/cron/crontabs

# Crontab. Notar:
# - busybox cron precisa de path absoluto para `node`.
# - `cd /app` antes de cada job para resolver imports relativos a node_modules.
# - 2>&1 manda stderr para stdout; > /proc/1/fd/1 redireciona para o stdout
#   do PID 1 (crond), capturado por docker logs.
cat > "$CRON_FILE" <<'EOF'
# PataCerta cron jobs (todos UTC)
# m  h  dom  mon  dow  command
#
# Cada entry faz `. /app/.cron.env` para herdar env vars do container
# (busybox crond nao propaga env automaticamente).

# ── Backups ──
# 02:00 UTC (03:00 Lisboa inverno, 04:00 verao) — janela baixa-actividade
# Postgres primeiro (rapido), depois MinIO (lento, depende do volume).
# Os scripts encriptam com age e enviam para bucket patacerta-backups.
0 2 * * * . /app/.cron.env && /app/scripts/backup-postgres.sh > /proc/1/fd/1 2>&1
5 2 * * * . /app/.cron.env && /app/scripts/backup-minio.sh > /proc/1/fd/1 2>&1

# 02:30 UTC — aplicar politica GFS (7d + 4w + 6m) ao bucket de backups.
# Corre 25 min apos o backup-postgres (margem para minio terminar).
30 2 * * * . /app/.cron.env && /app/scripts/rotate-backups.sh > /proc/1/fd/1 2>&1

# ── Jobs aplicacionais ──
# Expirar sponsored slots cujo endsAt ja' passou. Horario.
0 * * * * . /app/.cron.env && cd /app && /usr/local/bin/node apps/api/dist/jobs/expire-sponsored-slots.js > /proc/1/fd/1 2>&1

# Limpar refresh tokens expirados (>0d) e revogados (>30d). Diario 03:00 UTC.
0 3 * * * . /app/.cron.env && cd /app && /usr/local/bin/node apps/api/dist/jobs/cleanup-refresh-tokens.js > /proc/1/fd/1 2>&1
EOF

chmod 0644 "$CRON_FILE"

echo "[cron] Crontab instalado:"
cat "$CRON_FILE"
echo "[cron] A arrancar crond em foreground..."

# busybox crond:
#   -f  foreground (PID 1)
#   -l 8  log level (info)
#   -L /dev/stderr  redirect log para stderr (capturado por docker logs)
exec crond -f -l 8 -L /dev/stderr
