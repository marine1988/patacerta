#!/bin/sh
set -e

cd /app/apps/api

# ──────────────────────────────────────────────────────────────────────────
# DEBUG: Print key env vars for troubleshooting
# ──────────────────────────────────────────────────────────────────────────
echo "[PataCerta] ENV check: USE_DB_PUSH='$USE_DB_PUSH' RESET_DB_ON_BOOT='$RESET_DB_ON_BOOT'"

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
# USE_DB_PUSH: Skip migrations entirely and use prisma db push.
# This MUST be checked BEFORE any migration-related steps.
# TEMPORARY FORCE: Always use db push until migrations are fixed
# ──────────────────────────────────────────────────────────────────────────
USE_DB_PUSH_TRIMMED=$(echo "$USE_DB_PUSH" | tr -d '[:space:]')
# FORCE db push - migrations are broken, remove this after first successful deploy
FORCE_DB_PUSH=1
if [ "$FORCE_DB_PUSH" = "1" ] || [ "$USE_DB_PUSH_TRIMMED" = "true" ] || [ "$USE_DB_PUSH_TRIMMED" = "1" ]; then
  echo "[PataCerta] ⚠  USE_DB_PUSH (FORCED) — usando 'prisma db push --accept-data-loss'"
  npx prisma db push --skip-generate --accept-data-loss
  
  # Skip to seeds
  goto_seeds=1
else
  goto_seeds=0
fi

if [ "$goto_seeds" = "0" ]; then
  # ──────────────────────────────────────────────────────────────────────────
  # Pre-migrate: backfill de slugs (idempotente, zero-op se ja' OK).
  # Necessario porque migrations historicas adicionaram NOT NULL a slug em
  # bases criadas antes via db push. Em DB ja' migrada, nao faz nada.
  # ──────────────────────────────────────────────────────────────────────────
  echo "[PataCerta] Pre-migrate: backfill de slugs (idempotente)..."
  node dist/jobs/backfill-slugs.js || echo "[PataCerta] Pre-migrate slug backfill finished with non-zero exit"

  # ──────────────────────────────────────────────────────────────────────────
  # Migration strategy - prisma migrate deploy
  # ──────────────────────────────────────────────────────────────────────────
  echo "[PataCerta] A correr 'prisma migrate deploy'..."

  set +e
  MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
  MIGRATE_EXIT=$?
  set -e
  echo "$MIGRATE_OUTPUT"

  if [ "$MIGRATE_EXIT" -ne 0 ] && echo "$MIGRATE_OUTPUT" | grep -q "P3009"; then
    echo "[PataCerta] AVISO: migrate deploy falhou com P3009 — a tentar auto-recovery"

    FAILED_LIST=$(node --input-type=module -e "
      import { PrismaClient } from '@prisma/client'
      const p = new PrismaClient()
      try {
        const r = await p.\$queryRawUnsafe(
          \"SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL ORDER BY started_at\"
        )
        process.stdout.write(r.map(x => x.migration_name).join('\n'))
      } catch (err) {
        process.stderr.write('[recovery] ' + (err && err.message || err) + '\n')
        process.exit(2)
      } finally {
        await p.\$disconnect()
      }
    ")

    if [ -z "$FAILED_LIST" ]; then
      echo "[PataCerta] P3009 reportado mas nenhuma migration FAILED encontrada na tabela. A re-lancar erro original."
      exit "$MIGRATE_EXIT"
    fi

    echo "[PataCerta] Migrations a recuperar:"
    echo "$FAILED_LIST" | sed 's/^/  - /'

    echo "$FAILED_LIST" | while IFS= read -r mig; do
      [ -z "$mig" ] && continue
      echo "[PataCerta] Recovery: $mig → rolled-back + applied"
      npx prisma migrate resolve --rolled-back "$mig" 2>&1 | sed 's/^/    /' || true
      npx prisma migrate resolve --applied "$mig" 2>&1 | sed 's/^/    /' || true
    done

    echo "[PataCerta] Recovery concluido. A re-tentar migrate deploy..."
    npx prisma migrate deploy
  elif [ "$MIGRATE_EXIT" -ne 0 ]; then
    exit "$MIGRATE_EXIT"
  fi
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

echo "[PataCerta] Starting API server..."
cd /app
exec node apps/api/dist/index.js
