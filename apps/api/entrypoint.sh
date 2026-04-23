#!/bin/sh
set -e

echo "[PataCerta] Pushing database schema..."
cd /app/apps/api
npx prisma db push --skip-generate --accept-data-loss

echo "[PataCerta] Starting API server..."
cd /app
exec node apps/api/dist/index.js
