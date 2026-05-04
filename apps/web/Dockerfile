FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

# `VITE_PUBLIC_URL` e' resolvida em build-time pelo Vite (vai parar ao
# bundle JS, nao' a' env runtime). Por isso aceita-se como build-arg e
# expoe-se como ENV antes do `vite build`. Em prod esperamos
# `https://patacerta.pt`; em stage `https://stage.patacerta.pt`. Ver
# `apps/web/src/lib/seo.ts` (canonical, og:url, JSON-LD URLs).
ARG VITE_PUBLIC_URL=https://patacerta.pt
ENV VITE_PUBLIC_URL=$VITE_PUBLIC_URL

# Chave publica Stripe (pk_test_... ou pk_live_...). Vai parar ao
# bundle do browser, exposicao publica e' segura por design.
# Default vazio — sem chave configurada, o frontend esconde a UI de
# pagamento.
ARG VITE_STRIPE_PUBLISHABLE_KEY=
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

RUN pnpm --filter @patacerta/shared build
RUN pnpm --filter @patacerta/web build

FROM nginx:alpine AS runner
COPY --from=base /app/apps/web/dist /usr/share/nginx/html

# Templating do nginx.conf: a imagem oficial corre
# `/docker-entrypoint.d/20-envsubst-on-templates.sh` que processa
# `/etc/nginx/templates/*.template` e escreve o resultado em
# `/etc/nginx/conf.d/`. `NGINX_ENVSUBST_FILTER` restringe a
# substituicao a `ROBOTS_HEADER`, evitando que `$host`, `$remote_addr`,
# etc. (variaveis de runtime do nginx) sejam comidos pelo envsubst.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=ROBOTS_HEADER
ENV ROBOTS_HEADER=""

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
