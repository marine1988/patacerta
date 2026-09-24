# Testes E2E — Playwright

Testes end-to-end do PataCerta web. Correm em três sítios muito diferentes, e a
suite adapta-se a cada um:

| Ambiente | `E2E_BASE_URL`               | Dados       | Basic auth        | Tags a usar                                                   |
| -------- | ---------------------------- | ----------- | ----------------- | ------------------------------------------------------------- |
| local    | `http://localhost:5173`      | seeds demo  | não               | todas                                                         |
| stage    | `https://stage.patacerta.pt` | seeds demo  | **sim** (Traefik) | `@prod-safe` (+ `@destructive` se as creds de seed existirem) |
| produção | `https://patacerta.pt`       | dados reais | não               | **só `@prod-safe`**                                           |

## Estrutura

```
e2e/
  fixtures/
    env.ts                     # detecção de ambiente + capabilities (caps)
    test.ts                    # test estendido com a fixture `caps`
    auth.ts                    # login programático via API + helpers de sessão
    api.ts                     # helpers para obter dados reais da API (breeder, service)
    demo-data.ts               # constantes em sincronia com prisma/seed*.ts
  specs/                       # ver tabela de tags abaixo
  tsconfig.json                # typecheck dos specs (usado pelo `pnpm typecheck`)
```

## Pré-requisitos (local)

1. **Postgres + MinIO** a correr:

   ```bash
   pnpm docker:up
   ```

2. **Schema + seeds** aplicados:

   ```bash
   pnpm db:migrate
   pnpm db:seed                               # admin
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

   Em alternativa basta `pnpm dev:web` se a API já estiver noutro terminal — o
   `playwright.config.ts` arranca o Vite automaticamente quando `E2E_BASE_URL`
   **não** está definida.

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

Typecheck (inclui os specs via `e2e/tsconfig.json`):

```bash
pnpm --filter @patacerta/shared build && pnpm --filter @patacerta/api db:generate
pnpm --filter @patacerta/web typecheck
```

O `shared build` + `db:generate` são obrigatórios: sem eles o typecheck falha com
erros falsos (`Cannot find module '@patacerta/shared'`, `Prisma has no exported member …`)
que não têm nada a ver com os testes.

## Tags: `@prod-safe` vs `@destructive`

Cada `describe` (ou `test`, quando o caso é isolado) tem uma tag no título:

- **`@prod-safe`** — read-only. Não escreve na BD, não cria sessões Stripe, não
  dispara webhooks. É a única colecção que pode correr contra produção.
- **`@destructive`** — escreve na BD (contas novas, slots sponsored, sessões
  Stripe, webhooks simulados) e/ou consome rate-limit de autenticação.
  **Nunca** contra produção.

| Spec                                | Tag                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `api-contract.spec.ts`              | `@prod-safe`                                                                         |
| `seo-metadata.spec.ts`              | `@prod-safe`                                                                         |
| `home-navigation.spec.ts`           | `@prod-safe`                                                                         |
| `pesquisar.spec.ts`                 | `@prod-safe`                                                                         |
| `breeder-service-detail.spec.ts`    | `@prod-safe`                                                                         |
| `simulador.spec.ts`                 | `@prod-safe`                                                                         |
| `a11y.spec.ts`                      | `@prod-safe`                                                                         |
| `consent-cookies.spec.ts`           | `@prod-safe`                                                                         |
| `error-states.spec.ts`              | `@prod-safe`                                                                         |
| `dashboard-auth.spec.ts`            | `@prod-safe`                                                                         |
| `admin-panel.spec.ts`               | `@prod-safe`                                                                         |
| `responsive-mobile.spec.ts`         | `@prod-safe`                                                                         |
| `auth.spec.ts`                      | `@prod-safe` (login/registo/rotas) + `@destructive` em `cria nova conta com sucesso` |
| `sponsored-slot-checkout.spec.ts`   | `@destructive` — faz skip se o alvo não tiver Stripe (ver § CI)                      |
| `sponsored-slot-multibanco.spec.ts` | `@destructive`                                                                       |
| `sponsored-slot-webhook.spec.ts`    | `@destructive`                                                                       |

Filtrar por tag:

```bash
pnpm --filter @patacerta/web exec playwright test --grep @prod-safe
pnpm --filter @patacerta/web exec playwright test --grep @destructive
```

## Variáveis de ambiente

| Variável                                     | Default                                     | Para que serve                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`                               | `http://localhost:5173`                     | Alvo da UI. Definida ⇒ remoto: desliga o `webServer` local e força execução serial.                                                            |
| `E2E_API_URL`                                | `http://localhost:3001/api`                 | Base da API usada pelos fixtures (login, capabilities, dados reais).                                                                           |
| `E2E_HTTP_USER` / `E2E_HTTP_PASS`            | —                                           | HTTP basic auth do Traefik (**só stage**). Sem elas, tudo devolve 401. Nunca hard-coded.                                                       |
| `E2E_SKIP_DESTRUCTIVE`                       | —                                           | Qualquer valor liga: além dos `test.skip` nos specs, a config exclui `@destructive` do run. Usado pelo workflow de stage.                      |
| `E2E_ALLOW_DESTRUCTIVE`                      | —                                           | Override consciente do bloqueio automático de `@destructive` contra produção.                                                                  |
| `E2E_PROBE_LOGINS`                           | on, excepto prod                            | `1` força sondar os logins demo/admin, `0` desliga. Em produção fica off (as contas demo não existem e cada tentativa gasta rate-limit).       |
| `E2E_EXPECTED_PUBLIC_URL`                    | derivado do alvo                            | Override do domínio canónico esperado nas meta tags (`canonical`, `og:url`, sitemap).                                                          |
| `E2E_RETRIES`                                | 0 local / 1 remoto / 2 CI                   | nº de retries                                                                                                                                  |
| `E2E_OUTPUT_DIR`                             | `e2e/.artifacts`                            | Onde escrever traces/screenshots. Muda-o quando correres duas instâncias em paralelo, senão colidem e o Playwright rebenta na escrita (ENOENT) |
| `E2E_IGNORE_RATE_LIMIT`                      | —                                           | `1` desliga o fail-fast do `caps` quando o ambiente devolve 429 (o resultado deixa de ser fiável)                                              |
| `E2E_WEB_PORT`                               | `5173`                                      | Porta do Vite em local                                                                                                                         |
| `E2E_SKIP_FLAKY_LOGOUT`                      | —                                           | `1` salta o teste de logout (flake conhecido com proxy de inspecção TLS)                                                                       |
| `E2E_BREEDER_EMAIL` / `E2E_BREEDER_PASSWORD` | `canil.alvalade@example.pt` / `DemoPass123` | criador usado nos specs de sponsored slot                                                                                                      |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`     | `admin@patacerta.pt` / `AdminPass123!`      | admin usado para cleanup                                                                                                                       |
| `E2E_STRIPE_WEBHOOK_SECRET`                  | —                                           | sem ele os specs de webhook fazem skip                                                                                                         |

## Guardas automáticas contra ambientes partilhados

Assim que `E2E_BASE_URL` aponta para um host que não é `localhost`/`127.0.0.1`:

- `fullyParallel: false` e `workers: 1` — correr em paralelo contra um ambiente
  partilhado faz um teste correr com o estado de auth de outro e martela a API real;
- `retries: 1` — a rede real tem flakiness;
- execução **serial** também obriga a que os specs que mexem no mesmo criador
  (`sponsored-slot-*`, race em refresh-token) não colidam;
- contra **produção** (`patacerta.pt`), `grepInvert: /@destructive/` remove os
  testes destrutivos do run mesmo que o filtro pedido seja outro. Override:
  `E2E_ALLOW_DESTRUCTIVE=1`.

A config imprime no arranque uma linha com o alvo e as decisões tomadas, para
que o log da execução seja auto-explicativo:

```
[playwright.config] alvo=https://patacerta.pt (api=https://patacerta.pt/api) | remoto → execução serial (workers=1) | httpCredentials=AUSENTES — em stage isto dá 401 (Basic realm="traefik") | @destructive EXCLUÍDOS (produção) → usar --grep @prod-safe
```

## Detecção de capacidades (`caps`)

Os specs que dependem de dados reais importam o test estendido:

```ts
import { test, expect } from '../fixtures/test'
import { seedSkipReason } from '../fixtures/env'

test('lista de criadores mostra resultados', async ({ page, caps }) => {
  test.skip(!caps.hasBreeders, seedSkipReason(caps, 'criadores publicados'))
  // ...
})
```

O `caps` é resolvido **uma vez por worker** (fixture worker-scoped) e sonda:

| Campo                                           | Como é obtido                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env` / `baseUrl` / `apiBaseUrl`                | derivados de `E2E_BASE_URL` / `E2E_API_URL`                                                                                                                       |
| `apiHealthy`                                    | `GET /api/health` → `status=ok` + `services.database=connected`                                                                                                   |
| `authBlocked`                                   | `GET /api/health` devolveu 401/403 ⇒ alvo fechado por basic auth (stage sem `E2E_HTTP_USER`/`E2E_HTTP_PASS`). Nesse caso a sonda para aqui e não gasta rate-limit |
| `breedersTotal` / `hasBreeders`                 | `GET /api/search/breeders?limit=1` → `meta.total`                                                                                                                 |
| `servicesTotal` / `hasServices`                 | `GET /api/services?limit=1` → `meta.total`                                                                                                                        |
| `hasDemoClient` / `hasDemoBreeder` / `hasAdmin` | login real via API (só quando `PROBE_LOGINS` está on)                                                                                                             |
| `seeded`                                        | `hasDemoClient && hasDemoBreeder`                                                                                                                                 |

Resultado típico por ambiente:

| Ambiente        | `authBlocked` | `hasDemoClient` / `hasAdmin`      | Efeito nos specs                                                                |
| --------------- | ------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| local           | `false`       | `true` / `true`                   | tudo corre                                                                      |
| stage com creds | `false`       | `true` / `true`                   | tudo corre                                                                      |
| stage sem creds | **`true`**    | `false` / `false`                 | skips com mensagem a dizer que falta basic auth, em vez de 401s confusos        |
| produção        | `false`       | `false` (logins não são sondados) | specs de painel/login demo fazem skip: não há falso negativo por falta de seeds |

O worker imprime uma linha por ambiente, para a evidência do gate:

```
[caps] env=prod baseUrl=https://patacerta.pt apiBaseUrl=https://patacerta.pt/api apiHealthy=true authBlocked=false breeders=... services=... hasDemoClient=false hasDemoBreeder=false hasAdmin=false
```

## Correr contra stage

`stage.patacerta.pt` está **atrás de HTTP basic auth** (middleware Traefik):
sem credenciais, **todos** os pedidos (HTML e API) devolvem `401` com
`www-authenticate: Basic realm="traefik"`. As credenciais vêm do ambiente:

```bash
E2E_BASE_URL=https://stage.patacerta.pt \
E2E_API_URL=https://stage.patacerta.pt/api \
E2E_HTTP_USER=... E2E_HTTP_PASS=... \
pnpm --filter @patacerta/web exec playwright test --grep @prod-safe
```

Nunca committar as credenciais. Sem elas a config não rebenta — apenas não
envia credenciais e o resultado é 401 em tudo (falha honesta), com o aviso
correspondente impresso no arranque.

### GitHub Actions — `.github/workflows/e2e-stage.yml`

Triggers: **push para `dev`** (branch que faz deploy do stage — AGENTS.md §9)
e `workflow_dispatch` (inputs `stage_url` e `grep`). Não arranca stack: aponta
`E2E_BASE_URL` à URL pública, define `E2E_SKIP_DESTRUCTIVE=true`, faz sanity
check e publica relatório + traces como artefactos.

O trigger era `push: branches: [stage]` até ao card **PATA-CI-3**: a branch
`stage` estava 285 commits atrás, ninguém lá fazia push e o workflow tinha
corrido **uma única vez** (2026-04-28) — nunca a seguir a um deploy real.

⚠️ O push dispara o workflow _e_ o deploy do Dokploy ao mesmo tempo (deploy
~3-5 min). O step `Aguardar deploy` (só em push) espera que o alvo passe a
servir um build novo, com evidência real: o `Last-Modified` de `/` é o instante
do build da imagem que o nginx serve (verificado em produção). Ajustável por
variáveis do repo: `E2E_DEPLOY_TIMEOUT_SECONDS` (default 600 — se o header
existe mas o deploy não chega, o job **falha** em vez de correr contra o build
antigo), `E2E_DEPLOY_WAIT_SECONDS` (default 300 — espera fixa quando o alvo não
devolve `Last-Modified` utilizável) e `E2E_DEPLOY_POLL_SECONDS` (default 15).

⚠️ O sanity check inicial (`curl` à URL e a `/health`) e os próprios testes
também passam pelo basic auth do Traefik — o workflow precisa de
`E2E_HTTP_USER`/`E2E_HTTP_PASS` (secrets) para não terminar em 401.

## Correr contra produção

Só `@prod-safe`, sempre:

```bash
E2E_BASE_URL=https://patacerta.pt \
E2E_API_URL=https://patacerta.pt/api \
pnpm --filter @patacerta/web exec playwright test --grep @prod-safe --reporter=list
```

O que isto faz contra dados reais:

- **não escreve nada** na BD de produção (os `@destructive` são excluídos pela
  config, além de não passarem o `--grep`);
- um único `POST /api/auth/login` por run — o caso "mostra erro com credenciais
  inválidas" (`auth.spec.ts`). O limite é 10 tentativas / 15 min / IP;
- os specs que precisam de seeds/contas demo fazem skip com mensagem explícita
  (`caps`), em vez de falharem por falta de dados.

## CI (stack local) — `.github/workflows/e2e.yml`

O workflow arranca toda a stack (Postgres como service, build do API + Web,
seeds determinísticas) e corre a suite completa em headless chromium. O
relatório HTML e os traces de falha são publicados como artefactos.

### Stripe no job `E2E`: porque é que o checkout faz skip

O job corre a stack **sem nenhuma variável `STRIPE_*`** (confirmado no dump de
env do run `33769130209`). A tag `@destructive` **não** exclui o spec ali:
`E2E_SKIP_DESTRUCTIVE` só é definido no workflow de stage e o bloqueio
automático só se aplica a produção. Resultado, antes do card **PATA-CI-4**:
`sponsored-slot-checkout.spec.ts` era seleccionado, o
`POST /api/payments/sponsored-slot/checkout` devolvia
`503 STRIPE_NOT_CONFIGURED` (`apps/api/src/lib/stripe.ts` →
`payments.controller.ts`) e o `waitForURL(/checkout\.stripe\.com/)` esgotava
60s × 3 tentativas (≈3.3 min de falha determinística, que não diz nada sobre a
app).

Decisão: guard de skip **nos specs**, o mesmo padrão dos irmãos
`sponsored-slot-webhook.spec.ts` / `sponsored-slot-multibanco.spec.ts` (que
fazem skip sem `E2E_STRIPE_WEBHOOK_SECRET`). O helper vive em
`e2e/fixtures/env.ts` (`probeStripeOnTarget` + `stripeSkipReason`) e é usado
pelos **três** specs `sponsored-slot-*` — o webhook e o multibanco tinham a
mesma falha latente (o `E2E_STRIPE_WEBHOOK_SECRET` do runner diz que _temos_
secret para assinar, não que _o backend alvo_ tenha chave). Alternativas
rejeitadas:
`E2E_SKIP_DESTRUCTIVE=1` no job (a suite deixaria de validar o checkout nos
únicos ambientes que o podem correr) e uma chave de test mode por repo secret
(`gh secret list` estava vazio; retomar esta via é criar o secret e exportá-lo
no job — com o guard, o teste passa a correr sozinho quando isso acontecer).

A detecção é feita **em runtime no alvo** (`probeStripeOnTarget` no spec), não
por `process.env.STRIPE_SECRET_KEY`: o env do runner não é o env da API. A
sonda é um `POST /api/webhooks/stripe` sem assinatura — endpoint público, sem
rate-limit, que responde antes de tocar na base de dados, logo sem efeitos
secundários (ao contrário de um `POST /checkout`, que criaria sessão Stripe +
slot PENDING):

| Resposta da sonda            | Decisão                                |
| ---------------------------- | -------------------------------------- |
| `503 STRIPE_NOT_CONFIGURED`  | **skip** (o alvo não tem Stripe)       |
| `503 WEBHOOK_NOT_CONFIGURED` | corre (a chave existe; falta o secret) |
| `400 Assinatura em falta`    | corre (chave + secret presentes)       |
| rede / 401 / 429 / 404       | corre — não se faz skip por dúvida     |

O log do run fica com a evidência que justifica o skip:

```
[E2E] Stripe no alvo: POST http://localhost:3001/api/webhooks/stripe -> 503 STRIPE_NOT_CONFIGURED
```

## Troubleshooting

- **401 em tudo contra stage** → faltam `E2E_HTTP_USER`/`E2E_HTTP_PASS`
  (ou estão erradas). Confirma com
  `curl -sI https://stage.patacerta.pt/api/health` → `www-authenticate: Basic realm="traefik"`.
- **O run arrancou o Vite sem eu querer** → `E2E_BASE_URL` não estava definida.
- **`Expecting 200 but got 404` num endpoint novo** → deploy atrasado; o código
  ainda não está no ambiente.
- **Os specs fazem skip inesperadamente** → vê a linha `[caps]` do log: diz
  exatamente o que o ambiente tem (e se falta basic auth).
- **O checkout de sponsored slot fez skip no job `E2E`** → o alvo não tem
  `STRIPE_SECRET_KEY` (o job de CI não define nenhuma `STRIPE_*`). A linha
  `[E2E] Stripe no alvo: ...` diz a resposta da sonda; ver § CI.
- **`browserType.launch: Executable doesn't exist`** → `pnpm --filter @patacerta/web test:e2e:install`.

## Notas

- Os testes assumem as seeds `db:seed` e `db:seed:demo` em local/stage. Sem
  isso, os testes dependentes de breeders/serviços fazem skip via `caps` (ou,
  se já tiverem `caps` desactivado, falham com "nenhum resultado").
- A password partilhada pelos utilizadores demo é `DemoPass123` (ver
  `apps/api/prisma/seed-demo.ts`). O admin é `admin@patacerta.pt` /
  `AdminPass123!`.
- O login dos testes que precisam de autenticação é feito via API
  (`loginViaApi` em `fixtures/auth.ts`) e não pelo formulário UI — mais rápido
  e menos sujeito a flakes (o formulário tem cobertura própria em `auth.spec.ts`).
- `seo-metadata.spec.ts` contra produção: as falhas antes reportadas (asserts lidos
  **antes** da hidratação do React + regra de comprimento de `description` aplicada a
  rotas `noindex`) foram corrigidas no próprio spec. O sentinela de hidratação passou a
  ser o `<title>` final (o `og:url`/`canonical` estáticos do `index.html` coincidem com
  o runtime no `/`, logo não serviam para detectar hidratação). Não abrir bug de app sem
  reproduzir o DOM **já hidratado**.

## Rate-limit do ambiente (`apiRateLimit`) — o que bloqueia runs longos

A API aplica **200 pedidos / 15 min / IP** (`apps/api/src/middleware/rate-limit.ts`).
Uma passagem completa da suite `@prod-safe` consome mais do que isso, pelo que:

1. **Fail-fast**: a fixture `caps` sonda `/api/health`; se vier `429`, a suite **aborta**
   com uma mensagem a dizer quando o balde renova, em vez de produzir skips e falhas
   inventadas (com 429 todas as sondas devolvem 0 e `hasBreeders`/`hasServices` ficariam
   a `false` sem ser verdade). Override consciente: `E2E_IGNORE_RATE_LIMIT=1`.
2. **Correr em chunks**: cada spec consome ~40-60 pedidos. O padrão que funciona é
   esperar pelo reset (header `x-ratelimit-reset`) e correr 2-3 specs por janela:

   ```bash
   # 1) ver orçamento
   curl -s -D - -o /dev/null https://patacerta.pt/api/health | grep -i x-ratelimit
   # 2) correr um spec, esperar pelo reset, correr o seguinte
   for spec in api-contract seo-metadata a11y consent-cookies error-states \
               responsive-mobile home-navigation pesquisar breeder-service-detail \
               simulador auth dashboard-auth admin-panel; do
     E2E_BASE_URL=https://patacerta.pt E2E_API_URL=https://patacerta.pt/api E2E_RETRIES=0 \
       pnpm --filter @patacerta/web exec playwright test "specs/$spec.spec.ts" \
       --grep @prod-safe --reporter=list
   done
   ```

3. `/api/health`, `/api/status` e `/sitemap.xml` **também** estão atrás do limiter — ver
   card `PATA-BUG-3` (isentar os endpoints de saúde/SEO).
