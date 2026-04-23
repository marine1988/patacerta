#!/bin/sh
set -e

echo "[PataCerta] Pushing database schema..."
cd /app/apps/api
npx prisma db push --skip-generate --accept-data-loss

if [ "$RUN_SEED_ON_BOOT" = "true" ] || [ "$RUN_SEED_ON_BOOT" = "1" ]; then
  echo "[PataCerta] Running seed (RUN_SEED_ON_BOOT=$RUN_SEED_ON_BOOT)..."
  npx tsx prisma/seed.ts || echo "[PataCerta] Seed finished with non-zero exit (may be expected if data already present)"
else
  echo "[PataCerta] Skipping seed (set RUN_SEED_ON_BOOT=true to enable)"
fi

echo "[PataCerta] Starting API server..."
cd /app
exec node apps/api/dist/index.js
