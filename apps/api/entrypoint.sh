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
  # Detectar estado da DB: existe alguma tabela aplicacional? existe _prisma_migrations?
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
      if (!hasAppTables) process.stdout.write('EMPTY')
      else if (!hasMigrations) process.stdout.write('NEEDS_BASELINE')
      else process.stdout.write('MIGRATED')
    } catch (err) {
      process.stderr.write('[detector] ' + (err && err.message || err) + '\n')
      process.exit(2)
    } finally {
      await p.\$disconnect()
    }
  ")

  case "$DB_STATE" in
    EMPTY|NEEDS_BASELINE|MIGRATED)
      echo "[PataCerta] Estado da DB: $DB_STATE"
      ;;
    *)
      echo "[PataCerta] ERRO: detector de estado da DB devolveu valor inesperado ('$DB_STATE'). A abortar."
      exit 1
      ;;
  esac

  if [ "$DB_STATE" = "NEEDS_BASELINE" ]; then
    echo "[PataCerta] DB tem schema mas falta _prisma_migrations — a fazer baseline das migrations existentes..."
    for migration_dir in prisma/migrations/*/; do
      migration_name=$(basename "$migration_dir")
      # Saltar pasta migration_lock.toml ou similar
      if [ ! -f "${migration_dir}migration.sql" ]; then
        continue
      fi
      echo "[PataCerta]   resolve --applied $migration_name"
      npx prisma migrate resolve --applied "$migration_name" || {
        echo "[PataCerta] AVISO: resolve falhou para $migration_name (provavelmente ja' marcada)"
      }
    done
    echo "[PataCerta] Baseline concluido."
  fi

  echo "[PataCerta] A correr 'prisma migrate deploy'..."
  if ! npx prisma migrate deploy; then
    # P3009: ha entradas FAILED em _prisma_migrations. Caso comum em DBs
    # que originalmente foram criadas via `db push` e em que o primeiro
    # `migrate deploy` tentou correr migrations cujo SQL nao usa
    # IF NOT EXISTS — Prisma marca-as como failed mesmo que o schema
    # real esteja completo.
    #
    # Estrategia: listar as migrations marcadas FAILED, marca-las como
    # applied (sabemos que o schema esta correcto porque db push o criou
    # antes), depois correr migrate deploy outra vez (zero-op esperado).
    echo "[PataCerta] migrate deploy falhou. A tentar recuperar de migrations FAILED..."
    FAILED_MIGRATIONS=$(node --input-type=module -e "
      import { PrismaClient } from '@prisma/client'
      const p = new PrismaClient()
      try {
        const rows = await p.\$queryRawUnsafe(
          \"SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL\"
        )
        for (const r of rows) process.stdout.write(r.migration_name + '\n')
      } catch (err) {
        process.stderr.write('[recovery] ' + (err && err.message || err) + '\n')
        process.exit(2)
      } finally {
        await p.\$disconnect()
      }
    ")

    if [ -z "$FAILED_MIGRATIONS" ]; then
      echo "[PataCerta] ERRO: migrate deploy falhou mas nao ha migrations FAILED. Causa desconhecida. A abortar."
      exit 1
    fi

    echo "$FAILED_MIGRATIONS" | while IFS= read -r mig; do
      [ -z "$mig" ] && continue
      echo "[PataCerta]   resolve --applied $mig (assumindo que schema ja' tem o efeito da migration)"
      npx prisma migrate resolve --applied "$mig" || {
        echo "[PataCerta] AVISO: resolve falhou para $mig"
      }
    done

    echo "[PataCerta] A correr 'prisma migrate deploy' apos recuperacao..."
    npx prisma migrate deploy
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

if [ "$RUN_SEED_DEMO_ON_BOOT" = "true" ] || [ "$RUN_SEED_DEMO_ON_BOOT" = "1" ]; then
  echo "[PataCerta] Running demo seed (RUN_SEED_DEMO_ON_BOOT=$RUN_SEED_DEMO_ON_BOOT)..."
  npx tsx prisma/seed-demo.ts || echo "[PataCerta] Demo seed finished with non-zero exit"
else
  echo "[PataCerta] Skipping demo seed (set RUN_SEED_DEMO_ON_BOOT=true to enable)"
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
