import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config para os testes E2E do PataCerta web.
 *
 * Pressupostos em local:
 *  - A API (apps/api) está a correr em http://localhost:3001
 *  - Postgres + MinIO disponíveis (docker compose up -d)
 *  - As seeds `db:seed` e `db:seed:demo` foram executadas
 *
 * Em local, o Playwright arranca automaticamente o Vite dev server.
 * Assim que `E2E_BASE_URL` está definida (stage, produção, CI, preview) o
 * `webServer` é desligado — o alvo é externo e nunca arrancamos stack local
 * contra um ambiente remoto.
 *
 * ## Ambientes remotos (stage / produção)
 *
 * ```bash
 * # stage (atrás de Traefik basic auth)
 * E2E_BASE_URL=https://stage.patacerta.pt \
 * E2E_API_URL=https://stage.patacerta.pt/api \
 * E2E_HTTP_USER=... E2E_HTTP_PASS=... \
 * pnpm --filter @patacerta/web exec playwright test --grep @prod-safe
 *
 * # produção — SEMPRE só @prod-safe (read-only)
 * E2E_BASE_URL=https://patacerta.pt \
 * E2E_API_URL=https://patacerta.pt/api \
 * pnpm --filter @patacerta/web exec playwright test --grep @prod-safe
 * ```
 *
 * Regras aplicadas automaticamente contra hosts remotos:
 *  - execução SERIAL (`fullyParallel: false`, `workers: 1`) — correr em
 *    paralelo contra um ambiente partilhado corre com o estado de auth de
 *    outros testes e martela a API real;
 *  - `retries: 1` (rede real tem flakiness);
 *  - `httpCredentials` a partir de `E2E_HTTP_USER`/`E2E_HTTP_PASS` (nunca
 *    hard-coded) — sem elas o stage devolve 401 em tudo (`Basic realm="traefik"`);
 *  - em PRODUÇÃO os testes `@destructive` são excluídos automaticamente
 *    (`grepInvert`) — escrever na BD de produção não é opção. Override
 *    consciente: `E2E_ALLOW_DESTRUCTIVE=1`.
 *
 * Tags nos títulos (`describe`/`test`):
 *  - `@prod-safe`   — read-only, seguro contra dados reais;
 *  - `@destructive` — escreve na BD e/ou consome rate-limit (login, registo,
 *    checkout Stripe, webhooks). Nunca correr contra produção.
 *
 * Ver `e2e/README.md` para o guia completo.
 */

const PORT = Number(process.env.E2E_WEB_PORT || 5173)
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const apiBaseURL = process.env.E2E_API_URL || 'http://localhost:3001/api'
const isCI = !!process.env.CI

/**
 * Interpreta flags de ambiente de forma tolerante: `E2E_X=1|true|yes|on` liga,
 * `0|false|no|off` (ou vazio) desliga, ausente = `undefined` (default).
 */
function envFlag(name: string): boolean | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return undefined
  if (/^(0|false|no|off)$/i.test(raw.trim())) return false
  return true
}

/** Host do alvo, sem porta (`''` se `E2E_BASE_URL` for inválida). */
const targetHost = (() => {
  try {
    return new URL(baseURL).hostname.toLowerCase()
  } catch {
    return ''
  }
})()

/**
 * True quando o alvo não é a stack local (stage, produção, preview).
 * Um `E2E_BASE_URL` que não parseia conta como remoto: melhor assumir o
 * cenário conservador (sem webServer local, execução serial) do que arrancar
 * uma stack local a pensar que é dev.
 */
const isRemote =
  targetHost === '' ||
  !(targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost === '::1')

/** Produção: domínio canónico (sem basic auth, dados reais, zero writes). */
const isProd = targetHost === 'patacerta.pt' || targetHost === 'www.patacerta.pt'

const httpUser = process.env.E2E_HTTP_USER
const httpPass = process.env.E2E_HTTP_PASS
const hasHttpCredentials = Boolean(httpUser && httpPass)

/**
 * Exclusão de testes destrutivos:
 *  - `E2E_SKIP_DESTRUCTIVE=1` → pedido explícito (usado pelo workflow de stage);
 *  - alvo de PRODUÇÃO → automático, porque escrever na BD real não é opção.
 * `E2E_ALLOW_DESTRUCTIVE=1` sobrepõe-se ao automático de produção (override
 * consciente, para casos de manutenção planeada).
 */
const skipDestructiveFlag = envFlag('E2E_SKIP_DESTRUCTIVE') === true
const allowDestructive = envFlag('E2E_ALLOW_DESTRUCTIVE') === true
const excludeDestructive = skipDestructiveFlag || (isProd && !allowDestructive)

// Notas de ambiente impressas no arranque — ficam no log do gate, para que a
// evidência diga exactamente contra o que é que a suite correu.
// Vão para stderr (e não stdout) de propósito: `--reporter=json` escreve o
// relatório JSON no stdout e qualquer linha extra aí invalida o parsing.
const notes: string[] = []
notes.push(`alvo=${baseURL} (api=${apiBaseURL})`)
notes.push(isRemote ? 'remoto → execução serial (workers=1)' : 'local → paralelo')
if (isRemote && hasHttpCredentials) notes.push('httpCredentials=presentes')
if (isRemote && !hasHttpCredentials && !isProd) {
  notes.push('httpCredentials=AUSENTES — em stage isto dá 401 (Basic realm="traefik")')
}
if (excludeDestructive) {
  notes.push(
    `@destructive EXCLUÍDOS (${skipDestructiveFlag ? 'E2E_SKIP_DESTRUCTIVE' : 'produção'}) → usar --grep @prod-safe`,
  )
}
// stderr: mantém o stdout limpo para relatórios machine-readable
// (`--reporter=json`), onde uma linha extra invalida o parsing.
process.stderr.write(`[playwright.config] ${notes.join(' | ')}\n`)

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  outputDir: process.env.E2E_OUTPUT_DIR || './e2e/.artifacts',
  fullyParallel: !isRemote && !isCI,
  forbidOnly: isCI,
  retries:
    process.env.E2E_RETRIES !== undefined
      ? Number(process.env.E2E_RETRIES)
      : isCI
        ? 2
        : isRemote
          ? 1
          : 0,
  workers: isRemote || isCI ? 1 : undefined,
  // Barreira dura: em produção/`E2E_SKIP_DESTRUCTIVE` os specs que escrevem na
  // BD nem chegam a ser seleccionados (combinável com `--grep`).
  grepInvert: excludeDestructive ? /@destructive/ : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['html', { outputFolder: 'playwright-report', open: 'never' }], ['github'], ['list']]
    : [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    // Basic auth do Traefik (só stage). NUNCA hard-coded — vem do ambiente.
    // Aplica-se a `page` e ao fixture `request` (os specs batem na API por
    // URL absoluta, p.ex. https://stage.patacerta.pt/api/health).
    ...(hasHttpCredentials
      ? { httpCredentials: { username: httpUser!, password: httpPass! } }
      : {}),
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Em CI a stack é arrancada explicitamente pelo workflow (Postgres como
  // service + API + Web em background). Localmente, basta `pnpm dev:web`.
  // Contra um alvo remoto (stage/prod) nunca arrancamos webServer.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
