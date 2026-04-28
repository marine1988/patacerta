# Testes E2E — Playwright

Testes end-to-end das funcionalidades core do PataCerta web, validando
a integração real com a API e a base de dados.

## Estrutura

```
e2e/
  fixtures/
    auth.ts          # login programático via API + helpers de tokens
    api.ts           # helpers para obter dados reais da API (breeder, service)
    demo-data.ts     # constantes em sincronia com prisma/seed*.ts
  specs/
    home-navigation.spec.ts        # homepage, navbar, 404, redirects, páginas legais
    pesquisar.spec.ts              # tabs criadores/serviços, vista lista/mapa, filtros
    auth.spec.ts                   # login, registo, rotas protegidas
    breeder-service-detail.spec.ts # /criador/:id e /servicos/:id
    simulador.spec.ts              # quiz multi-step + resultados
```

## Pré-requisitos

1. **Postgres + MinIO** a correr:

   ```bash
   pnpm docker:up
   ```

2. **Schema + seeds** aplicados:

   ```bash
   pnpm db:migrate
   pnpm db:seed         # admin
   pnpm --filter @patacerta/api db:seed:demo   # criadores e serviços demo
   ```

3. **Variáveis de ambiente** recomendadas (em dev) para evitar bloqueios:

   ```env
   AUTH_SKIP_EMAIL_VERIFICATION=true
   DISABLE_RATE_LIMITS=true
   REVIEW_ELIGIBILITY_BYPASS=1
   ```

4. **API + Web** a correr:

   ```bash
   pnpm dev   # API em :3001, Web em :5173
   ```

   Em alternativa basta `pnpm dev:web` se a API já estiver em outro terminal —
   o `playwright.config.ts` arranca o Vite automaticamente quando
   `E2E_BASE_URL` não está definida.

## Correr os testes

```bash
# A partir da raiz
pnpm --filter @patacerta/web test:e2e

# Ou de dentro de apps/web
pnpm test:e2e            # headless
pnpm test:e2e:ui         # modo UI interativo
pnpm test:e2e:headed     # com browser visível
```

Primeira vez? Instalar os browsers Playwright:

```bash
pnpm --filter @patacerta/web test:e2e:install
```

## CI

`.github/workflows/e2e.yml` arranca toda a stack (Postgres como service,
build do API + Web, seeds determinísticas) e corre o suite em headless
chromium. O relatório HTML e os traces de falha são publicados como
artefactos do workflow.

## Correr contra stage

Existem dois caminhos:

### 1. Localmente, contra `https://stage.patacerta.pt`

```bash
# Não arranca Vite local — usa a URL pública.
$env:E2E_BASE_URL="https://stage.patacerta.pt"        # PowerShell
$env:E2E_API_URL="https://stage.patacerta.pt/api"
$env:E2E_SKIP_DESTRUCTIVE="true"                       # opcional, evita criar contas reais
pnpm --filter @patacerta/web test:e2e
```

ou em bash:

```bash
E2E_BASE_URL=https://stage.patacerta.pt \
E2E_API_URL=https://stage.patacerta.pt/api \
E2E_SKIP_DESTRUCTIVE=true \
pnpm --filter @patacerta/web test:e2e
```

Pré-requisitos em stage:

- Seeds `db:seed` + `db:seed:demo` aplicadas (utilizadores
  `cliente1@example.pt` … `cliente4@example.pt` com password
  `DemoPass123`).
- `AUTH_SKIP_EMAIL_VERIFICATION=true` e `DISABLE_RATE_LIMITS=true` no
  ambiente da API stage (já o default em `.env.stage.example`).

### 2. GitHub Actions — `.github/workflows/e2e-stage.yml`

Triggers:

- **workflow_dispatch** — corre manualmente a partir da aba _Actions_.
  Aceita inputs `stage_url` (override) e `grep` (filtrar testes).
- **push para a branch `stage`** — smoke automático após cada deploy.

O workflow:

- Não arranca Postgres/API/Web — aponta `E2E_BASE_URL` à URL pública.
- Define `E2E_SKIP_DESTRUCTIVE=true` para não criar contas reais.
- Faz health-check antes de correr os testes (aborta se stage estiver
  down).
- Publica `playwright-report-stage` e traces como artefactos.

## Notas

- Os testes assumem que as seeds `db:seed` e `db:seed:demo` correram. Sem
  isso, os testes que dependem de breeders/serviços reais (`pesquisar`,
  `breeder-service-detail`) vão falhar com "nenhum resultado".
- A password partilhada pelos utilizadores demo é `DemoPass123` (ver
  `apps/api/prisma/seed-demo.ts`).
- O login dos testes que precisam de autenticação é feito via API
  (helper `loginViaApi` em `fixtures/auth.ts`) e não através do
  formulário UI — mais rápido e menos sujeito a flakes.
