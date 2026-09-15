# E2E contra stage — HTTP basic auth (Traefik)

> Referência: card **PATA-BUG-1** ("stage.patacerta.pt atrás de basic auth —
> workflow e2e-stage quebrado").

## Sintoma

`https://stage.patacerta.pt` está protegido por HTTP basic auth do Traefik
(Dokploy). **Todos** os paths devolvem 401 — inclusive os que o E2E usa:

```bash
$ curl -s -D - -o /dev/null https://stage.patacerta.pt/
HTTP/2 401
www-authenticate: Basic realm="traefik"

$ curl -s -o /dev/null -w '%{http_code}\n' https://stage.patacerta.pt/api/health
401
```

Produção (`https://patacerta.pt`) não tem esta proteção (responde 200).

Consequência: qualquer job que corra Playwright contra stage falhava antes de
executar um único teste. O workflow `.github/workflows/e2e-stage.yml` só dizia
`Stage não respondeu em 50s — abort`, sem indicar a causa.

## Onde vive a proteção

Não está no repositório: não existe `htpasswd` nem `basicauth` em
`docker-compose*.yml`, `.env.stage.example` ou `docs/`. É um **middleware do
Traefik configurado no painel do Dokploy** (host `178.238.233.201`, o mesmo de
produção) aplicado ao domínio de stage. Os valores do par
utilizador/password só existem lá.

## Opção A — credenciais como GitHub Secrets (implementada)

O wiring já está feito; falta só criar os secrets:

1. GitHub → repo → **Settings → Secrets and variables → Actions → New secret**
   - `E2E_HTTP_USER` — utilizador do middleware de basic auth do stage
   - `E2E_HTTP_PASS` — password do mesmo middleware
2. Nada mais a fazer. O workflow `E2E (Stage)` passa-os por env
   (`E2E_HTTP_USER` / `E2E_HTTP_PASS`) e o `apps/web/playwright.config.ts`
   injecta-os em `use.httpCredentials`, o que cobre **o browser (`page`) e o
   fixture `request`** (os specs batem na API por URL absoluta).

Localmente usa-se o mesmo par, sem secrets do GitHub:

```bash
E2E_BASE_URL=https://stage.patacerta.pt \
E2E_API_URL=https://stage.patacerta.pt/api \
E2E_HTTP_USER=... E2E_HTTP_PASS=... \
pnpm --filter @patacerta/web exec playwright test --grep @prod-safe
```

## Opção B — desproteger (parte de) o stage no Traefik

Alternativa sem credenciais em CI: excluir do middleware de basic auth as rotas
que o E2E público usa (ex.: `/api/health`, `/robots.txt`, `/sitemap.xml`) com um
router de prioridade superior, ou retirar o middleware do domínio de stage.
Trade-off: o stage fica indexável/acessível a terceiros — daí ser decisão de
infra, não de CI.

## Como o workflow reporta o problema (PATA-BUG-1)

`e2e-stage.yml` tem agora três barreiras explícitas, todas com `::error`:

| Step                            | Comportamento                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pré-voo — credenciais do alvo` | falha logo no início com "Credenciais de basic auth em falta" se o alvo não for produção e os secrets não existirem (não gasta 2 min de `pnpm install`)             |
| `Sanity check — alvo responde`  | `curl` autenticado; distingue 401-com-`WWW-Authenticate: Basic` (realm) de 401 sem realm, e de alvo realmente morto; não espera 50s quando o diagnóstico já é claro |
| `Sanity check — API health`     | usa as credenciais; 401/403 falha (os specs iriam todos falhar), 429/5xx só avisa                                                                                   |
