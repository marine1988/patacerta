#!/bin/sh
set -e

cd /app/apps/api

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

echo "[PataCerta] Pre-push: backfill de slugs (caso a DB tenha registos com slug=NULL antes do db push aplicar NOT NULL)..."
# Schema-agnostic via SQL raw — corre antes do db push porque a coluna
# slug e' agora NOT NULL no schema. Se houver NULLs na DB de boots
# anteriores, o db push falharia ao aplicar a constraint sem este passo.
# Idempotente: zero updates quando todos os registos ja' tem slug.
node dist/jobs/backfill-slugs.js || echo "[PataCerta] Pre-push slug backfill finished with non-zero exit"

echo "[PataCerta] Pushing database schema..."
npx prisma db push --skip-generate --accept-data-loss

if [ "$RUN_SEED_ON_BOOT" = "true" ] || [ "$RUN_SEED_ON_BOOT" = "1" ]; then
  echo "[PataCerta] Running seed (RUN_SEED_ON_BOOT=$RUN_SEED_ON_BOOT)..."
  npx tsx prisma/seed.ts || echo "[PataCerta] Seed finished with non-zero exit (may be expected if data already present)"
else
  echo "[PataCerta] Skipping seed (set RUN_SEED_ON_BOOT=true to enable)"
fi

if [ "$RUN_SEED_DEMO_ON_BOOT" = "true" ] || [ "$RUN_SEED_DEMO_ON_BOOT" = "1" ]; then
  echo "[PataCerta] Running demo seed (RUN_SEED_DEMO_ON_BOOT=$RUN_SEED_DEMO_ON_BOOT)..."
  npx tsx prisma/seed-demo.ts || echo "[PataCerta] Demo seed finished with non-zero exit"
else
  echo "[PataCerta] Skipping demo seed (set RUN_SEED_DEMO_ON_BOOT=true to enable)"
fi

# Backfill dos agregados desnormalizados (Breeder.avgRating/reviewCount).
# Idempotente: apenas re-calcula a partir das Reviews PUBLISHED. Necessario
# apos prisma db push adicionar as colunas — sem isto os breeders existentes
# ficavam com avgRating=null/reviewCount=0 ate' a' proxima escrita de review.
#
# Corremos o JS compilado (em dist/) em vez de tsx contra src/ — a imagem
# de runtime so' tem dist/, package.json, prisma/ e node_modules.
echo "[PataCerta] Backfilling breeder stats..."
node dist/jobs/backfill-breeder-stats.js || echo "[PataCerta] Backfill finished with non-zero exit"

echo "[PataCerta] Starting API server..."
cd /app
exec node apps/api/dist/index.js
