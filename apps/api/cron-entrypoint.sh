#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# cron-entrypoint.sh
#
# Arranca crond (busybox) com 2 jobs do PataCerta:
#  - expire-sponsored-slots:  horario (minuto 0 de cada hora)
#  - cleanup-refresh-tokens:  diario 03:00 UTC
#
# Logs:
#  - busybox crond escreve para stderr quando corrido com `-f -l 8`.
#  - Os jobs em si redirecionam stdout/stderr para /proc/1/fd/1 (PID 1
#    deste container e' o crond), garantindo que os logs aparecem em
#    `docker logs` / Dokploy console em vez de mailbox local.
#
# Variaveis de ambiente herdadas (vindas do compose):
#  - DATABASE_URL: usado pelos jobs via apps/api/src/lib/prisma.js
#  - Outras envs nao sao necessarias (jobs nao usam JWT/MinIO/SMTP).
#
# Failsafe:
#  - Se DATABASE_URL nao estiver definida, abortamos antes de arrancar
#    crond para detectar config-leak cedo.
# ──────────────────────────────────────────────────────────────────────────
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[cron] FATAL: DATABASE_URL nao definida. A abortar." >&2
  exit 1
fi

CRON_FILE=/var/spool/cron/crontabs/root
mkdir -p /var/spool/cron/crontabs

# Crontab. Notar:
# - busybox cron precisa de path absoluto para `node`.
# - `cd /app` antes de cada job para resolver imports relativos a node_modules.
# - 2>&1 manda stderr para stdout; > /proc/1/fd/1 redireciona para o stdout
#   do PID 1 (crond), capturado por docker logs.
cat > "$CRON_FILE" <<'EOF'
# PataCerta cron jobs
# m  h  dom  mon  dow  command

# Expirar sponsored slots cujo endsAt ja' passou. Horario.
0 * * * * cd /app && /usr/local/bin/node apps/api/dist/jobs/expire-sponsored-slots.js > /proc/1/fd/1 2>&1

# Limpar refresh tokens expirados (>0d) e revogados (>30d). Diario 03:00 UTC.
0 3 * * * cd /app && /usr/local/bin/node apps/api/dist/jobs/cleanup-refresh-tokens.js > /proc/1/fd/1 2>&1
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
