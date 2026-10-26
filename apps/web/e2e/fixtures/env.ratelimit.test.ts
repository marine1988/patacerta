/**
 * Regressão do PATA-E2E-BUG-3 — a fixture `caps` tem de detectar o balde de
 * rate-limit do IP a partir de sondas **não isentas**, não de `/api/health`.
 *
 * Depois do PATA-BUG-3 o `GET /api/health` é isento do `apiRateLimit` (nunca
 * devolve 429), logo a detecção exclusivamente por esse endpoint deixava de
 * disparar: com o balde gasto, as sondas seguintes davam 429 → 0 → `hasBreeders`
 * / `seeded` a `false` → skips a dizer "ambiente sem seeds", que é mentira.
 *
 * Estes testes correm `probeCapabilities` contra um servidor `node:http` local
 * (porta efémera, `127.0.0.1`) que imita esse ambiente — sem rede, sem
 * credenciais e sem browsers (o `APIRequestContext` do Playwright é HTTP puro).
 *
 * Corre com o Vitest (`pnpm --filter @patacerta/web test`), não com o Playwright:
 * o `testMatch` do Playwright é `*.spec.ts`, por isso este ficheiro não é
 * apanhado pela suite E2E.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { request as playwrightRequest } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Capabilities } from './env'

type Handler = (req: IncomingMessage, res: ServerResponse) => void

interface FakeApi {
  /** Base da API falsa, com o sufixo `/api` (o que `E2E_API_URL` espera). */
  baseUrl: string
  /** Pedidos recebidos, na ordem: `GET /api/health`, `POST /api/auth/login`, … */
  hits: string[]
  /** Caminhos pedidos (sem query). */
  paths: () => string[]
  close: () => Promise<void>
}

const open: FakeApi[] = []

function startFakeApi(handler: Handler): Promise<FakeApi> {
  const hits: string[] = []
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`)
    handler(req, res)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const api: FakeApi = {
        baseUrl: `http://127.0.0.1:${port}/api`,
        hits,
        paths: () => hits.map((hit) => hit.split(' ')[1].split('?')[0]),
        close: () =>
          new Promise((done) => {
            // Keep-alive do request context: fechar as ligações antes de
            // fechar o servidor, senão o close() fica pendurado.
            server.closeAllConnections()
            server.close(() => done())
          }),
      }
      open.push(api)
      resolve(api)
    })
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function healthy(res: ServerResponse): void {
  json(res, 200, { status: 'ok', services: { database: 'connected' } })
}

/** Resposta do limiter: 429 + `x-ratelimit-reset` em segundos epoch. */
function rateLimited(res: ServerResponse, resetEpochSeconds: number): void {
  res.writeHead(429, {
    'content-type': 'application/json',
    'x-ratelimit-reset': String(resetEpochSeconds),
  })
  res.end(JSON.stringify({ error: 'Demasiados pedidos. Tente novamente mais tarde.' }))
}

const resetEpoch = (offsetSeconds = 900): number => Math.floor(Date.now() / 1000) + offsetSeconds
const isoOf = (epochSeconds: number): string => new Date(epochSeconds * 1000).toISOString()

/**
 * Corre `probeCapabilities` contra a API falsa. `E2E_API_URL` é lido no import
 * do módulo (`fixtures/demo-data.ts`), daí o `resetModules()` + import dinâmico
 * para cada cenário.
 */
async function probeAgainst(api: FakeApi, env: Record<string, string> = {}): Promise<Capabilities> {
  vi.resetModules()
  process.env.E2E_API_URL = api.baseUrl
  process.env.E2E_BASE_URL = 'http://localhost:5173'
  for (const [key, value] of Object.entries(env)) process.env[key] = value

  const { probeCapabilities } = await import('./env')
  const request = await playwrightRequest.newContext({ baseURL: api.baseUrl })
  try {
    return await probeCapabilities(request)
  } finally {
    await request.dispose()
    for (const key of Object.keys(env)) delete process.env[key]
  }
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((api) => api.close()))
})

describe('probeCapabilities — detecção de rate-limit (PATA-E2E-BUG-3)', () => {
  it('429 nas sondas não isentas (health a 200) → rateLimited, sem gastar mais pedidos', async () => {
    const reset = resetEpoch()
    const api = await startFakeApi((req, res) => {
      if (req.url === '/api/health') return healthy(res)
      rateLimited(res, reset)
    })

    const caps = await probeAgainst(api)

    expect(caps.rateLimited).toBe(true)
    expect(caps.rateLimitResetAt).toBe(isoOf(reset))
    // A saúde continua a ser informação válida: foi sondada e respondeu 200.
    expect(caps.apiHealthy).toBe(true)
    // Nada disto pode ser lido como "ambiente sem seeds" sem ser mentira.
    expect(caps.seeded).toBe(false)
    expect(caps.hasBreeders).toBe(false)
    expect(caps.hasServices).toBe(false)
    // Paragem imediata: nem os logins (balde próprio) são sondados depois de
    // se saber que o balde está gasto.
    expect(api.hits).toHaveLength(3)
    expect(api.paths()).toEqual(
      expect.arrayContaining(['/api/health', '/api/search/breeders', '/api/services']),
    )
    expect(api.hits.some((hit) => hit.startsWith('POST'))).toBe(false)
  })

  it('ambiente saudável e com dados → rateLimited=false (sem falso positivo)', async () => {
    const api = await startFakeApi((req, res) => {
      if (req.url === '/api/health') return healthy(res)
      if (req.url?.startsWith('/api/search/breeders')) return json(res, 200, { meta: { total: 3 } })
      if (req.url?.startsWith('/api/services')) return json(res, 200, { meta: { total: 2 } })
      if (req.url === '/api/auth/login') return json(res, 200, { accessToken: 'token' })
      json(res, 404, {})
    })

    const caps = await probeAgainst(api, { E2E_PROBE_LOGINS: '1' })

    expect(caps.rateLimited).toBe(false)
    expect(caps.rateLimitResetAt).toBeNull()
    expect(caps.apiHealthy).toBe(true)
    expect(caps.breedersTotal).toBe(3)
    expect(caps.servicesTotal).toBe(2)
    expect(caps.hasBreeders).toBe(true)
    expect(caps.hasServices).toBe(true)
    expect(caps.seeded).toBe(true)
    expect(caps.hasAdmin).toBe(true)
  })

  it('429 do limiter de autenticação → rateLimited com o reset dessa resposta', async () => {
    const listReset = resetEpoch(600)
    const loginReset = resetEpoch(120)
    const api = await startFakeApi((req, res) => {
      if (req.url === '/api/health') return healthy(res)
      if (req.url === '/api/auth/login') return rateLimited(res, loginReset)
      if (req.url?.startsWith('/api/search/breeders')) return json(res, 200, { meta: { total: 3 } })
      if (req.url?.startsWith('/api/services')) return json(res, 200, { meta: { total: 2 } })
      rateLimited(res, listReset)
    })

    const caps = await probeAgainst(api, { E2E_PROBE_LOGINS: '1' })

    expect(caps.rateLimited).toBe(true)
    // O reset é o da resposta que devolveu 429 (o login), não o de outra sonda.
    expect(caps.rateLimitResetAt).toBe(isoOf(loginReset))
    // As listagens tinham respondido: os totais não se perdem (um run forçado
    // com E2E_IGNORE_RATE_LIMIT=1 não passa a dizer "sem seeds").
    expect(caps.breedersTotal).toBe(3)
    expect(caps.servicesTotal).toBe(2)
    expect(caps.hasBreeders).toBe(true)
    expect(caps.hasServices).toBe(true)
    expect(caps.seeded).toBe(false)
  })

  it('lista a 429 e a outra a 200 → rateLimited mas preserva o total válido', async () => {
    const reset = resetEpoch()
    const api = await startFakeApi((req, res) => {
      if (req.url === '/api/health') return healthy(res)
      if (req.url?.startsWith('/api/search/breeders')) return rateLimited(res, reset)
      if (req.url?.startsWith('/api/services')) return json(res, 200, { meta: { total: 7 } })
      rateLimited(res, reset)
    })

    const caps = await probeAgainst(api, { E2E_PROBE_LOGINS: '1' })

    expect(caps.rateLimited).toBe(true)
    expect(caps.rateLimitResetAt).toBe(isoOf(reset))
    expect(caps.breedersTotal).toBe(0)
    expect(caps.hasBreeders).toBe(false)
    expect(caps.servicesTotal).toBe(7)
    expect(caps.hasServices).toBe(true)
    expect(api.hits.some((hit) => hit.startsWith('POST'))).toBe(false)
  })

  it('429 em /health (alvo em build anterior ao PATA-BUG-3) → rateLimited sem mais sondas', async () => {
    const reset = resetEpoch()
    const api = await startFakeApi((_req, res) => rateLimited(res, reset))

    const caps = await probeAgainst(api)

    expect(caps.rateLimited).toBe(true)
    expect(caps.rateLimitResetAt).toBe(isoOf(reset))
    expect(caps.apiHealthy).toBe(false)
    expect(api.hits).toEqual(['GET /api/health'])
  })

  it('401 em /health → authBlocked, sem gastar sondas nem rate-limit de login', async () => {
    const api = await startFakeApi((_req, res) => {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="traefik"' })
      res.end()
    })

    const caps = await probeAgainst(api)

    expect(caps.authBlocked).toBe(true)
    expect(caps.rateLimited).toBe(false)
    expect(caps.apiHealthy).toBe(false)
    expect(api.hits).toEqual(['GET /api/health'])
  })
})
