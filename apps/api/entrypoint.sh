#!/bin/sh
set -e

cd /app/apps/api

# ──────────────────────────────────────────────────────────────────────────
# DEBUG: imprimir env vars relevantes para diagnostico de seeds/flags.
# Nao imprime valores sensiveis (DATABASE_URL, JWT_SECRET, etc).
# ──────────────────────────────────────────────────────────────────────────
echo "[PataCerta][debug] NODE_ENV=$NODE_ENV"
echo "[PataCerta][debug] RESET_DB_ON_BOOT=$RESET_DB_ON_BOOT"
echo "[PataCerta][debug] RUN_SEED_ON_BOOT=$RUN_SEED_ON_BOOT"
echo "[PataCerta][debug] RUN_SEED_DEMO_ON_BOOT=$RUN_SEED_DEMO_ON_BOOT"
echo "[PataCerta][debug] SEED_INCLUDE_DEMO=$SEED_INCLUDE_DEMO"
echo "[PataCerta][debug] AUTH_SKIP_EMAIL_VERIFICATION=$AUTH_SKIP_EMAIL_VERIFICATION"
echo "[PataCerta][debug] DISABLE_RATE_LIMITS=$DISABLE_RATE_LIMITS"
echo "[PataCerta][debug] env vars com SEED no nome:"
env | grep -i seed || echo "[PataCerta][debug]   (nenhuma)"

# ──────────────────────────────────────────────────────────────────────────
# RESET_DB_ON_BOOT: dropa schema public. NUNCA usar em prod sem confirmacao
# explicita. Usado em stage para reset rapido durante desenvolvimento.
# ──────────────────────────────────────────────────────────────────────────
if [ "$RESET_DB_ON_BOOT" = "true" ] || [ "$RESET_DB_ON_BOOT" = "1" ]; then
  echo "[PataCerta] ⚠  RESET_DB_ON_BOOT=$RESET_DB_ON_BOOT — dropping public schema and recreating (ALL DATA WILL BE LOST)"
  node --input-type=module -e "
    import { PrismaClient } from '@prisma/client'
    const p = new PrismaClient()
    try {
      await p.\$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE')
      await p.\$executeRawUnsafe('CREATE SCHEMA public')
      await p.\$executeRawUnsafe('GRANT ALL ON SCHEMA public TO public')
      console.log('[PataCerta] Schema reset complete.')
    } finally {
      await p.\$disconnect()
    }
  "
fi

# ──────────────────────────────────────────────────────────────────────────
# Pre-migrate: backfill de slugs (idempotente, zero-op se ja' OK).
# Necessario porque migrations historicas adicionaram NOT NULL a slug em
# bases criadas antes via db push. Em DB ja' migrada, nao faz nada.
# ──────────────────────────────────────────────────────────────────────────
echo "[PataCerta] Pre-migrate: backfill de slugs (idempotente)..."
node dist/jobs/backfill-slugs.js || echo "[PataCerta] Pre-migrate slug backfill finished with non-zero exit"

# ──────────────────────────────────────────────────────────────────────────
# Migration strategy.
#
# Por defeito usamos `prisma migrate deploy` (versionado, sem perda de
# dados, audit trail em _prisma_migrations).
#
# Casos especiais tratados automaticamente:
#
#  1. DB vazia (sem tabelas): migrate deploy cria tudo a partir das
#     migrations versionadas. Comportamento normal.
#
#  2. DB com schema mas SEM _prisma_migrations (ex: foi criada antes via
#     `db push`, como o stage actual): fazemos baseline — marcamos todas
#     as migrations existentes como aplicadas e seguimos. As migrations
#     usam IF NOT EXISTS / idempotent SQL, logo qualquer drift mestre e'
#     tolerado.
#
#  3. DB ja' com _prisma_migrations: comportamento standard, migrate
#     deploy aplica apenas as novas pendentes.
#
# Escape hatch: definir USE_DB_PUSH=1 forca o comportamento legado
# (`prisma db push --accept-data-loss`). NUNCA usar em prod salvo
# instrucao explicita do operador.
# ──────────────────────────────────────────────────────────────────────────
if [ "$USE_DB_PUSH" = "true" ] || [ "$USE_DB_PUSH" = "1" ]; then
  echo "[PataCerta] ⚠  USE_DB_PUSH=$USE_DB_PUSH — usando 'prisma db push --accept-data-loss' (legado, sem audit trail)"
  npx prisma db push --skip-generate --accept-data-loss
else
  # ────────────────────────────────────────────────────────────────────────
  # Estrategia de baseline robusta para DBs criadas via `db push`.
  #
  # Problema: as migrations versionadas geradas por `prisma migrate dev`
  # nao usam IF NOT EXISTS (CREATE TABLE, CREATE TYPE, ALTER TABLE ADD
  # COLUMN, etc.). Num schema ja' totalmente provisionado por `db push`
  # anterior, qualquer `migrate deploy` falhara' com "already exists" /
  # P3018 / P3009.
  #
  # Solucao: para cada migration versionada que NAO esteja em
  # `_prisma_migrations` com finished_at IS NOT NULL E rolled_back_at IS
  # NULL (ou seja, "applied limpo"), marcamo-la como applied antes de
  # correr `migrate deploy`. Isto cobre os 3 cenarios:
  #
  #   1. DB EMPTY (nova): nenhuma esta marcada → marcamos todas como
  #      applied → migrate deploy detecta "tudo applied", cria
  #      `_prisma_migrations` se nao existir... mas espera, nao corre
  #      o SQL. Aqui SIM precisamos de comportamento diferente: se DB
  #      vazia, `migrate deploy` directo (sem pre-baseline) cria tudo.
  #
  #   2. DB com schema (db push) sem `_prisma_migrations`: marcamos
  #      todas como applied → migrate deploy zero-op.
  #
  #   3. DB com schema sem `_prisma_migrations`, com algumas marcadas
  #      como FAILED (estado intermedio dos boots anteriores): para
  #      cada FAILED, primeiro `resolve --rolled-back`, depois
  #      `resolve --applied`. Para as nao registadas, `resolve --applied`.
  #      → migrate deploy zero-op.
  #
  #   4. Steady-state (futuro): adicionamos uma migration nova → ela nao
  #      esta registada → marcamo-la como applied antes do deploy. ⚠ ISSO
  #      E' MAU: salta o SQL da migration nova!
  #
  # Para evitar o caso 4, distinguimos: so' fazemos o "pre-baseline" se
  # a DB ja' tem tabelas aplicacionais MAS as migrations nao estao todas
  # registadas (sintoma de db push legado). Se a DB esta MIGRATED limpo,
  # `migrate deploy` corre normalmente.
  # ────────────────────────────────────────────────────────────────────────

  echo "[PataCerta] A inspeccionar estado da base de dados..."
  DB_STATE=$(node --input-type=module -e "
    import { PrismaClient } from '@prisma/client'
    const p = new PrismaClient()
    try {
      const tables = await p.\$queryRawUnsafe(
        \"SELECT tablename FROM pg_tables WHERE schemaname='public'\"
      )
      const names = tables.map(t => t.tablename)
      const hasMigrations = names.includes('_prisma_migrations')
      const hasAppTables = names.some(n => n !== '_prisma_migrations')
      if (!hasAppTables && !hasMigrations) process.stdout.write('EMPTY')
      else if (!hasAppTables && hasMigrations) process.stdout.write('EMPTY')
      else if (!hasMigrations) process.stdout.write('NEEDS_BASELINE')
      else process.stdout.write('HAS_MIGRATIONS_TABLE')
    } catch (err) {
      process.stderr.write('[detector] ' + (err && err.message || err) + '\n')
      process.exit(2)
    } finally {
      await p.\$disconnect()
    }
  ")

  case "$DB_STATE" in
    EMPTY|NEEDS_BASELINE|HAS_MIGRATIONS_TABLE)
      echo "[PataCerta] Estado da DB: $DB_STATE"
      ;;
    *)
      echo "[PataCerta] ERRO: detector de estado da DB devolveu valor inesperado ('$DB_STATE'). A abortar."
      exit 1
      ;;
  esac

  # Para HAS_MIGRATIONS_TABLE precisamos saber se ha migrations nao-aplicadas
  # ou em estado FAILED — sintoma de drift db-push-legacy.
  NEEDS_DRIFT_REPAIR=0
  if [ "$DB_STATE" = "HAS_MIGRATIONS_TABLE" ] || [ "$DB_STATE" = "NEEDS_BASELINE" ]; then
    # Conta migrations versionadas no disco
    DISK_COUNT=$(ls -1 prisma/migrations/ 2>/dev/null | grep -E '^[0-9]+_' | wc -l | tr -d ' ')

    # Conta migrations applied limpo na DB (0 se _prisma_migrations nao existe)
    if [ "$DB_STATE" = "NEEDS_BASELINE" ]; then
      APPLIED_COUNT=0
      FAILED_COUNT=0
    else
      APPLIED_COUNT=$(node --input-type=module -e "
        import { PrismaClient } from '@prisma/client'
        const p = new PrismaClient()
        try {
          const r = await p.\$queryRawUnsafe(
            \"SELECT COUNT(*)::int AS c FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL\"
          )
          process.stdout.write(String(r[0].c))
        } finally { await p.\$disconnect() }
      ")
      FAILED_COUNT=$(node --input-type=module -e "
        import { PrismaClient } from '@prisma/client'
        const p = new PrismaClient()
        try {
          const r = await p.\$queryRawUnsafe(
            \"SELECT COUNT(*)::int AS c FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL\"
          )
          process.stdout.write(String(r[0].c))
        } finally { await p.\$disconnect() }
      ")
    fi

    echo "[PataCerta] Migrations no disco: $DISK_COUNT | applied limpo: $APPLIED_COUNT | failed/rolled-back: $FAILED_COUNT"

    # Drift se ha tabelas aplicacionais MAS o numero applied e' menor que o total
    # no disco (sintoma classico de db push legado, ou de boot intermedio falhado).
    if [ "$APPLIED_COUNT" -lt "$DISK_COUNT" ] || [ "$FAILED_COUNT" -gt 0 ]; then
      NEEDS_DRIFT_REPAIR=1
    fi
  fi

  if [ "$NEEDS_DRIFT_REPAIR" = "1" ]; then
    echo "[PataCerta] A reparar drift: schema fisico ja' contem efeito das migrations versionadas"
    echo "[PataCerta] (DB criada/expandida via 'db push' antes da introducao de migrate deploy)."

    for migration_dir in prisma/migrations/*/; do
      migration_name=$(basename "$migration_dir")
      [ ! -f "${migration_dir}migration.sql" ] && continue

      # Verifica estado actual desta migration na DB.
      # Nome da migration vem do nome do directorio, sempre [0-9a-z_], seguro
      # para interpolacao directa (sem risco de SQL injection).
      MIG_STATE=$(node --input-type=module -e "
        import { PrismaClient } from '@prisma/client'
        const p = new PrismaClient()
        try {
          const r = await p.\$queryRawUnsafe(
            \"SELECT finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = '$migration_name'\"
          )
          if (r.length === 0) process.stdout.write('MISSING')
          else if (r[0].rolled_back_at) process.stdout.write('ROLLED_BACK')
          else if (!r[0].finished_at) process.stdout.write('FAILED')
          else process.stdout.write('APPLIED')
        } catch (err) {
          process.stdout.write('MISSING')
        } finally { await p.\$disconnect() }
      " 2>/dev/null)

      case "$MIG_STATE" in
        APPLIED)
          echo "[PataCerta]   $migration_name: ja' APPLIED, skip"
          ;;
        FAILED)
          echo "[PataCerta]   $migration_name: FAILED → rolled-back + applied"
          npx prisma migrate resolve --rolled-back "$migration_name" || \
            echo "[PataCerta]   AVISO: rolled-back falhou para $migration_name"
          npx prisma migrate resolve --applied "$migration_name" || \
            echo "[PataCerta]   AVISO: applied falhou para $migration_name"
          ;;
        ROLLED_BACK|MISSING)
          echo "[PataCerta]   $migration_name: $MIG_STATE → applied"
          npx prisma migrate resolve --applied "$migration_name" || \
            echo "[PataCerta]   AVISO: applied falhou para $migration_name"
          ;;
        *)
          echo "[PataCerta]   $migration_name: estado desconhecido '$MIG_STATE', skip"
          ;;
      esac
    done

    echo "[PataCerta] Reparacao concluida."
  fi

  echo "[PataCerta] A correr 'prisma migrate deploy'..."
  npx prisma migrate deploy
fi

# ──────────────────────────────────────────────────────────────────────────
# Seeds (opcionais, off por defeito em prod).
# ──────────────────────────────────────────────────────────────────────────
if [ "$RUN_SEED_ON_BOOT" = "true" ] || [ "$RUN_SEED_ON_BOOT" = "1" ]; then
  echo "[PataCerta] Running seed (RUN_SEED_ON_BOOT=$RUN_SEED_ON_BOOT)..."
  npx tsx prisma/seed.ts || echo "[PataCerta] Seed finished with non-zero exit (may be expected if data already present)"
else
  echo "[PataCerta] Skipping seed (set RUN_SEED_ON_BOOT=true to enable)"
fi

if [ "$RUN_SEED_DEMO_ON_BOOT" = "true" ] || [ "$RUN_SEED_DEMO_ON_BOOT" = "1" ] \
  || [ "$SEED_INCLUDE_DEMO" = "true" ] || [ "$SEED_INCLUDE_DEMO" = "1" ]; then
  echo "[PataCerta] Running demo seed (RUN_SEED_DEMO_ON_BOOT=$RUN_SEED_DEMO_ON_BOOT SEED_INCLUDE_DEMO=$SEED_INCLUDE_DEMO)..."
  npx tsx prisma/seed-demo.ts || echo "[PataCerta] Demo seed finished with non-zero exit"
else
  echo "[PataCerta] Skipping demo seed (set RUN_SEED_DEMO_ON_BOOT=true or SEED_INCLUDE_DEMO=true to enable)"
fi

# ──────────────────────────────────────────────────────────────────────────
# Backfill dos agregados desnormalizados (Breeder.avgRating/reviewCount).
# Idempotente: re-calcula a partir das Reviews PUBLISHED.
# ──────────────────────────────────────────────────────────────────────────
echo "[PataCerta] Backfilling breeder stats..."
node dist/jobs/backfill-breeder-stats.js || echo "[PataCerta] Backfill finished with non-zero exit"

echo "[PataCerta] Starting API server..."
cd /app
exec node apps/api/dist/index.js
