FROM node:20-alpine AS base
# Cache bust: 2026-06-30
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

RUN pnpm --filter @patacerta/shared build
RUN pnpm --filter @patacerta/api db:generate
RUN pnpm --filter @patacerta/api build

FROM node:20-alpine AS runner
# Ferramentas runtime:
#   openssl              — usado pelo Prisma client (requirido em alpine)
#   postgresql16-client  — pg_dump/pg_restore para backups (versao tem que
#                          casar com o servidor: postgres:16-alpine).
#                          Em alpine 3.19+ o pacote chama-se postgresql16-client.
#   age                  — encriptacao moderna (chave Ed25519) para backups.
#   wget                 — usado pelos scripts de backup para Healthchecks pings
#                          (ja vem na maior parte dos node:20-alpine, garantimos).
#   ca-certificates      — necessario para wget HTTPS (Healthchecks.io)
#   tar                  — empacotar uploads MinIO antes de encriptar
# Nota: o cliente MinIO `mc` e' descarregado como binario standalone
# (nao esta nos repos do alpine). E' fixado a uma release especifica para
# reprodutibilidade do build.
RUN apk add --no-cache \
      openssl \
      postgresql16-client \
      age \
      wget \
      ca-certificates \
      tar \
  && wget -qO /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc.RELEASE.2025-08-13T08-35-41Z \
  && chmod +x /usr/local/bin/mc \
  && /usr/local/bin/mc --version

WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=base /app/apps/api/prisma ./apps/api/prisma
# `src/` e' necessario em runtime apenas para o endpoint admin
# /admin/internal/run-demo-seed (e equivalente local) que executa
# `tsx prisma/seed-demo.ts`. O seed importa `src/lib/*.ts` (slugs,
# prisma client wrapper, etc.). Em producao real este endpoint esta
# bloqueado por NODE_ENV !== 'production', mas a presenca dos source
# files nao tem impacto runtime para a API normal (~1MB extra).
COPY --from=base /app/apps/api/src ./apps/api/src
COPY --from=base /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/entrypoint.sh /app/entrypoint.sh
COPY apps/api/cron-entrypoint.sh /app/cron-entrypoint.sh
COPY apps/api/scripts/ /app/scripts/
RUN chmod +x /app/entrypoint.sh /app/cron-entrypoint.sh /app/scripts/*.sh

EXPOSE 3001
ENV NODE_ENV=production
ENTRYPOINT ["/app/entrypoint.sh"]
