// ============================================
// PataCerta — Rate limit middleware tests
// ============================================
//
// Regressão PATA-BUG-3: o `apiRateLimit` global (200 pedidos / 15 min / IP)
// era aplicado a `/api/health`, `/api/status` e `/sitemap.xml`, pelo que um
// balde esgotado transformava endpoints de infra/observabilidade em 429:
// falsos alarmes de uptime, manutenção invisível para a SPA
// (`MaintenanceContext` lê `/api/status`) e suite E2E obrigada a correr em
// chunks. O fix isenta esses caminhos via a opção `skip` do `rateLimit()`
// (sem tocar na ordem dos middleware em `index.ts`).
//
// O middleware é montado num Express real servido em `127.0.0.1` (porta
// efémera) com rotas-stub: o assert é sobre o comportamento HTTP (código de
// estado e headers), não sobre a expressão do predicado. Sem DB e sem Redis
// (sem `REDIS_URL` o limiter usa o store em memória).
//
// O `memoryStore` é por módulo, por isso cada caso reimporta o módulo
// (`vi.resetModules`) para arrancar com o balde limpo.

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { RequestHandler } from 'express'
import { request } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'

/** Caminhos que o PATA-BUG-3 isenta. */
const EXEMPT_PATHS = ['/api/health', '/api/status', '/sitemap.xml', '/robots.txt']
/** Caminho normal (não isento) usado como controlo para esgotar o balde. */
const CONTROL_PATH = '/api/breeders'
/** Valor de `max` em `apiRateLimit` — 200 pedidos por 15 min por IP. */
const MAX = 200

// `apps/api/vitest.setup.ts` desliga os rate limits por omissão
// (`DISABLE_RATE_LIMITS=true`), para os testes que só tocam nos limiters de
// forma incidental não ficarem flaky. Aqui o rate limit É o objecto do teste.
const ORIGINAL_DISABLE = process.env.DISABLE_RATE_LIMITS

interface Probe {
  status: number
  headers: Record<string, string>
  body: string
}

let server: Server | undefined

beforeEach(() => {
  process.env.DISABLE_RATE_LIMITS = 'false'
})

afterEach(async () => {
  const current = server
  server = undefined
  if (current) {
    current.closeIdleConnections()
    await new Promise<void>((resolve) => current.close(() => resolve()))
  }
  if (ORIGINAL_DISABLE === undefined) delete process.env.DISABLE_RATE_LIMITS
  else process.env.DISABLE_RATE_LIMITS = ORIGINAL_DISABLE
})

/**
 * Reimporta o módulo para obter um limiter novo — e, com ele, um
 * `memoryStore` novo (o balde não é partilhado entre casos).
 */
async function freshApiRateLimit(): Promise<RequestHandler> {
  vi.resetModules()
  const mod = await import('./rate-limit.js')
  return mod.apiRateLimit as RequestHandler
}

/**
 * App Express mínimo: o limiter primeiro, depois rotas-stub que respondem
 * sempre 200 com o caminho montado. `agent: false` em cada pedido evita
 * sockets keep-alive, para o `server.close()` não ficar pendurado.
 */
async function startApp(limiter: RequestHandler): Promise<string> {
  const app = express()
  app.use(limiter)
  for (const path of [...EXEMPT_PATHS, CONTROL_PATH, '/api/healthcheck']) {
    app.use(path, (_req, res) => {
      res.json({ ok: true, path })
    })
  }
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server!.once('listening', () => resolve()))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

function get(baseUrl: string, path: string): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const req = request(`${baseUrl}${path}`, { agent: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body,
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function probeMany(baseUrl: string, path: string, times: number): Promise<Probe[]> {
  const out: Probe[] = []
  for (let i = 0; i < times; i++) out.push(await get(baseUrl, path))
  return out
}

describe('apiRateLimit — endpoints de saúde/SEO isentos (PATA-BUG-3)', () => {
  it('com o balde esgotado, /api/health, /api/status, /sitemap.xml e /robots.txt continuam 200', async () => {
    const baseUrl = await startApp(await freshApiRateLimit())

    // 200 pedidos passam, o 201.º é rejeitado (a política é `count > max`).
    const control = await probeMany(baseUrl, CONTROL_PATH, MAX + 1)
    expect(control[control.length - 2]!.status, 'o 200.º pedido devia passar').toBe(200)
    const rejected = control[control.length - 1]!
    expect(rejected.status, 'o 201.º pedido devia ser 429').toBe(429)
    expect(rejected.headers['x-ratelimit-remaining']).toBe('0')
    expect(JSON.parse(rejected.body)).toMatchObject({ code: 'RATE_LIMITED' })

    for (const path of EXEMPT_PATHS) {
      const res = await get(baseUrl, path)
      expect(res.status, `${path} não devia apanhar o 429 (balde esgotado)`).toBe(200)
      // Isento = saiu antes de tocar no contador, logo sem headers de balde.
      expect(res.headers['x-ratelimit-limit'], `${path} contou para o balde`).toBeUndefined()
      expect(res.headers['x-ratelimit-remaining'], `${path} contou para o balde`).toBeUndefined()
    }
  })

  it('pedidos isentos não gastam orçamento do balde', async () => {
    const baseUrl = await startApp(await freshApiRateLimit())

    const used = await probeMany(baseUrl, CONTROL_PATH, MAX - 1)
    expect(used.every((r) => r.status === 200)).toBe(true)
    expect(used[used.length - 1]!.headers['x-ratelimit-remaining']).toBe('1')

    // 5 pedidos a cada endpoint isento: se contassem, o balde morria aqui.
    for (const path of EXEMPT_PATHS) {
      const probes = await probeMany(baseUrl, path, 5)
      expect(
        probes.every((r) => r.status === 200),
        `${path} foi penalizado`,
      ).toBe(true)
    }

    // O 200.º pedido ao caminho normal ainda passa (só 199 tinham sido gastos).
    const last = await get(baseUrl, CONTROL_PATH)
    expect(last.status).toBe(200)
    expect(last.headers['x-ratelimit-remaining']).toBe('0')

    // E o 201.º é o primeiro a ser rejeitado.
    expect((await get(baseUrl, CONTROL_PATH)).status).toBe(429)
  })

  it('a isenção tolera trailing slash e maiúsculas, tal como o router do Express', async () => {
    const baseUrl = await startApp(await freshApiRateLimit())
    await probeMany(baseUrl, CONTROL_PATH, MAX + 1) // esgota o balde

    for (const path of ['/api/health/', '/API/Health', '/sitemap.xml/']) {
      expect((await get(baseUrl, path)).status, `${path} devia estar isento`).toBe(200)
    }
  })

  it('não isenta vizinhos por prefixo (/api/healthcheck, /api/health/extra)', async () => {
    const baseUrl = await startApp(await freshApiRateLimit())
    await probeMany(baseUrl, CONTROL_PATH, MAX + 1) // esgota o balde

    for (const path of ['/api/healthcheck', '/api/health/extra']) {
      expect((await get(baseUrl, path)).status, `${path} não devia estar isento`).toBe(429)
    }
  })

  it('o `skip` é opt-in: um limiter sem skip continua a limitar /api/health', async () => {
    vi.resetModules()
    const { rateLimit } = await import('./rate-limit.js')
    const baseUrl = await startApp(
      rateLimit({ windowMs: 60_000, max: 1, bucket: 'sem-skip' }) as RequestHandler,
    )

    expect((await get(baseUrl, '/api/health')).status).toBe(200)
    expect((await get(baseUrl, '/api/health')).status).toBe(429)
  })
})
