FROM node:20-alpine AS base
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
RUN apk add --no-cache openssl

WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=base /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001
ENV NODE_ENV=production
ENTRYPOINT ["/app/entrypoint.sh"]
