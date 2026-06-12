#!/bin/sh
set -e

cd /app/apps/api

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

echo "[PataCerta] Starting API server..."
cd /app
exec node apps/api/dist/index.js
