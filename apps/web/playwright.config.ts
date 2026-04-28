import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config para os testes E2E do PataCerta web.
 *
 * Pressupostos:
 *  - A API (apps/api) está a correr em http://localhost:3001
 *  - Postgres + MinIO disponíveis (docker compose up -d)
 *  - As seeds `db:seed` e `db:seed:demo` foram executadas
 *
 * Em local, o Playwright arranca automaticamente o Vite dev server.
 * Em CI, basta apontar para a URL onde o web está a correr através de
 * E2E_BASE_URL — assim evita-se duplicar o webServer.
 */

const PORT = Number(process.env.E2E_WEB_PORT || 5173)
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  outputDir: './e2e/.artifacts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
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
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Em CI a stack é arrancada explicitamente pelo workflow (Postgres como
  // service + API + Web em background). Localmente, basta `pnpm dev:web`.
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
