#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# rotate-backups.sh
#
# Aplica politica GFS (Grandfather-Father-Son) ao bucket de backups:
#   - Daily:    manter 7 mais recentes
#   - Weekly:   manter 4 (1 por semana ISO, escolhido o mais recente)
#   - Monthly:  manter 6 (1 por mes, escolhido o mais recente)
#
# Total estimado: 7 + 4 + 6 = 17 backups por categoria (postgres E minio).
#
# Algoritmo:
#   1. Listar todos os objectos de cada prefix (postgres/, minio/)
#   2. Parse timestamp do nome do ficheiro (postgres-YYYY-MM-DD_HHMMSS.dump.age)
#   3. Para cada categoria:
#      a. Ordenar por data desc
#      b. Marcar os N mais recentes como "keep" (daily)
#      c. Para cada semana ISO unica nos restantes, marcar o mais recente (weekly)
#      d. Para cada mes unico nos restantes, marcar o mais recente (monthly)
#      e. Apagar tudo o que nao foi marcado
#
# Idempotente: correr 2x seguidas nao apaga nada extra.
#
# Implementacao em sh + awk para evitar dependencias (sem python/jq).
#
# Vars:
#   MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
#
# Opcionais:
#   MINIO_BACKUP_BUCKET (default: patacerta-backups)
#   RETENTION_DAILY (default: 7)
#   RETENTION_WEEKLY (default: 4)
#   RETENTION_MONTHLY (default: 6)
#   DRY_RUN=1 — lista o que apagaria sem apagar
#   HEALTHCHECKS_URL_ROTATE
# ──────────────────────────────────────────────────────────────────────────
set -eu

: "${MINIO_ENDPOINT:?[rotate] FATAL: MINIO_ENDPOINT nao definida}"
: "${MINIO_PORT:?[rotate] FATAL: MINIO_PORT nao definida}"
: "${MINIO_ACCESS_KEY:?[rotate] FATAL: MINIO_ACCESS_KEY nao definida}"
: "${MINIO_SECRET_KEY:?[rotate] FATAL: MINIO_SECRET_KEY nao definida}"

MINIO_BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-patacerta-backups}"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-4}"
RETENTION_MONTHLY="${RETENTION_MONTHLY:-6}"
DRY_RUN="${DRY_RUN:-0}"
HC_URL="${HEALTHCHECKS_URL_ROTATE:-}"

hc_ping() {
  if [ -n "$HC_URL" ]; then
    wget -q -O /dev/null --timeout=10 "$HC_URL$1" 2>/dev/null || true
  fi
}
hc_ping "/start"

trap 'rc=$?; if [ $rc -ne 0 ]; then echo "[rotate] FALHOU exit $rc" >&2; hc_ping "/fail"; fi; exit $rc' EXIT

MC_ALIAS="local"
mc alias set "$MC_ALIAS" "http://${MINIO_ENDPOINT}:${MINIO_PORT}" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null

# ── Funcao: rotaciona um prefix (e.g. "postgres" ou "minio") ──
rotate_prefix() {
  local prefix="$1"
  local label="$2"

  echo "[rotate] === ${label} (prefix: ${prefix}/) ==="

  # Listar todos os objectos. mc ls --recursive --json devolve 1 JSON por linha.
  # Extraimos "key" (caminho relativo ao bucket).
  local listing
  listing=$(mc ls --recursive --json "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${prefix}/" 2>/dev/null | grep -o '"key":"[^"]*"' | cut -d'"' -f4 || true)

  if [ -z "$listing" ]; then
    echo "[rotate] ${label}: 0 backups, nada a rotacionar"
    return 0
  fi

  local total
  total=$(echo "$listing" | wc -l)
  echo "[rotate] ${label}: ${total} backups encontrados"

  # ── awk: classifica cada ficheiro com tag KEEP/DELETE ──
  # Input (stdin): 1 path por linha (e.g. "postgres/2026/05/postgres-2026-05-08_020000.dump.age")
  # Parse: extrai YYYY-MM-DD_HHMMSS do nome do ficheiro.
  # Calcula: epoch (para ordenacao), week-of-year (YYYY-WW), month (YYYY-MM).
  # Aplica retencao: top N mais recentes = daily; depois 1 por semana ISO unica
  # (max RETENTION_WEEKLY); depois 1 por mes unico (max RETENTION_MONTHLY).
  #
  # Output: "KEEP <path> <razao>" ou "DELETE <path>"
  local decisions
  decisions=$(echo "$listing" | awk -v daily="$RETENTION_DAILY" -v weekly="$RETENTION_WEEKLY" -v monthly="$RETENTION_MONTHLY" '
    BEGIN {
      n = 0
    }
    {
      path = $0
      # Extrair timestamp YYYY-MM-DD_HHMMSS do filename
      # Match grupo: -2026-05-08_143000.
      if (match(path, /[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}/)) {
        ts = substr(path, RSTART, RLENGTH)
        year = substr(ts, 1, 4) + 0
        mon  = substr(ts, 6, 2) + 0
        day  = substr(ts, 9, 2) + 0
        hh   = substr(ts, 12, 2) + 0
        mm   = substr(ts, 14, 2) + 0
        ss   = substr(ts, 16, 2) + 0
        # Epoch aproximado (suficiente para ordenacao). mktime existe em gawk;
        # busybox awk nao tem, entao usamos representacao lexicografica.
        sortkey = sprintf("%04d%02d%02d%02d%02d%02d", year, mon, day, hh, mm, ss)
        # week-of-year aproximada: nao temos calendario completo em awk
        # busybox, mas year+iso-week e' suficiente para granularidade semanal.
        # Aproximacao: week = floor((day_of_year + day_of_year_jan1_offset) / 7)
        # Para evitar complicacoes, usamos year+truncated-week como key:
        # (year * 53) + floor((mon-1)*4.345 + (day-1)/7)
        wk = int(((mon - 1) * 30 + (day - 1)) / 7)
        weekkey = sprintf("%04d-W%02d", year, wk)
        monkey  = sprintf("%04d-%02d", year, mon)
        n++
        paths[n] = path
        keys[n] = sortkey
        weeks[n] = weekkey
        months[n] = monkey
        marked[n] = 0
      } else {
        # Path sem timestamp valido — log e mantemos por seguranca
        print "KEEP " path " (timestamp-nao-parsavel)"
      }
    }
    END {
      # Ordenacao bubble-sort descendente por sortkey (n e tipicamente <50)
      for (i = 1; i <= n; i++) {
        for (j = i + 1; j <= n; j++) {
          if (keys[j] > keys[i]) {
            t = keys[i]; keys[i] = keys[j]; keys[j] = t
            t = paths[i]; paths[i] = paths[j]; paths[j] = t
            t = weeks[i]; weeks[i] = weeks[j]; weeks[j] = t
            t = months[i]; months[i] = months[j]; months[j] = t
          }
        }
      }

      # 1. Daily: top N mais recentes
      for (i = 1; i <= n && i <= daily; i++) {
        marked[i] = 1
        reasons[i] = "daily"
      }

      # 2. Weekly: nos restantes, 1 por semana unica, max N
      seen_weeks_count = 0
      for (i = 1; i <= n && seen_weeks_count < weekly; i++) {
        if (marked[i]) continue
        if (!(weeks[i] in seen_weeks)) {
          seen_weeks[weeks[i]] = 1
          marked[i] = 1
          reasons[i] = "weekly:" weeks[i]
          seen_weeks_count++
        }
      }

      # 3. Monthly: nos restantes, 1 por mes unico, max N
      seen_months_count = 0
      for (i = 1; i <= n && seen_months_count < monthly; i++) {
        if (marked[i]) continue
        if (!(months[i] in seen_months)) {
          seen_months[months[i]] = 1
          marked[i] = 1
          reasons[i] = "monthly:" months[i]
          seen_months_count++
        }
      }

      # Output
      for (i = 1; i <= n; i++) {
        if (marked[i]) {
          print "KEEP " paths[i] " (" reasons[i] ")"
        } else {
          print "DELETE " paths[i]
        }
      }
    }
  ')

  # ── Aplicar decisoes ──
  local kept=0
  local deleted=0
  echo "$decisions" | while IFS= read -r line; do
    case "$line" in
      KEEP\ *)
        kept=$((kept + 1))
        # Logamos so a 1 de cada categoria para nao poluir
        ;;
      DELETE\ *)
        path=$(echo "$line" | cut -d' ' -f2)
        if [ "$DRY_RUN" = "1" ]; then
          echo "[rotate] DRY: apagaria ${path}"
        else
          if mc rm "${MC_ALIAS}/${MINIO_BACKUP_BUCKET}/${path}" >/dev/null 2>&1; then
            echo "[rotate] apagado ${path}"
            deleted=$((deleted + 1))
          else
            echo "[rotate] WARN: falhou apagar ${path}" >&2
          fi
        fi
        ;;
    esac
  done

  # Resumo (kept/deleted nao sobrevivem ao subshell do pipe — recalcular)
  local kept_count
  local del_count
  kept_count=$(echo "$decisions" | grep -c '^KEEP ' || true)
  del_count=$(echo "$decisions" | grep -c '^DELETE ' || true)
  echo "[rotate] ${label}: ${kept_count} mantidos, ${del_count} apagados"
}

rotate_prefix "postgres" "Postgres"
rotate_prefix "minio" "MinIO uploads"

echo "[rotate] $(date -u +%FT%TZ) terminado"
hc_ping ""
trap - EXIT
exit 0
