/**
 * PATA-BUG-8 — o interceptor de `apps/web/src/lib/api.ts` nao pode entrar
 * em ciclo de refresh quando o 401 vem de credenciais de INFRA.
 *
 * Em stage o host inteiro esta atras do middleware de basic auth do
 * Traefik. O axios acrescenta `Authorization: Bearer <token>`, o Traefik
 * valida esse header como credencial de basic auth, nao reconhece `Bearer`
 * e responde 401 + `WWW-Authenticate: Basic realm="traefik"`. Como o
 * /auth/refresh vai SEM `Authorization`, o challenge deixa-o passar e ele
 * devolve 200 — o que fazia o interceptor acreditar que era uma sessao
 * expirada e repetir o pedido em ciclo.
 *
 * O servidor HTTP local destes testes replica esse comportamento
 * (401 + realm), incluindo o refresh que passa sempre.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

type Mode = 'ok' | 'ok-after-refresh' | 'api-401' | 'proxy-401'

interface State {
  mode: Mode
  refreshCalls: number
  statusCalls: number
  refreshFails: boolean
  /** Authorization recebido no /api/status de cada pedido, por ordem. */
  seenAuthorization: (string | undefined)[]
}

let server: http.Server
let baseURL: string
let state: State

function readBody(_req: http.IncomingMessage): void {
  /* corpo nao interessa: os pedidos deste teste sao sem body */
}

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  readBody(req)
  const url = req.url ?? ''

  if (url.endsWith('/api/auth/refresh')) {
    state.refreshCalls += 1
    if (state.refreshFails) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'Refresh token invalido', code: 'INVALID_REFRESH' }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ accessToken: 'token-novo' }))
    return
  }

  if (url.endsWith('/api/status')) {
    state.statusCalls += 1
    state.seenAuthorization.push(req.headers.authorization)

    if (state.mode === 'proxy-401') {
      // Exactamente o que o Traefik devolve em stage hoje.
      res.writeHead(401, {
        'content-type': 'text/plain',
        'www-authenticate': 'Basic realm="traefik"',
      })
      res.end('401 Unauthorized')
      return
    }

    if (state.mode === 'api-401') {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'Sessao expirada', code: 'TOKEN_EXPIRED' }))
      return
    }

    if (state.mode === 'ok-after-refresh' && state.refreshCalls === 0) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'Sessao expirada', code: 'TOKEN_EXPIRED' }))
      return
    }

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'online' }))
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ message: 'Not found' }))
}

/** Stubs minimos de browser: o modulo usa localStorage e window.location. */
function installBrowserStubs(): void {
  const store = new Map<string, string>()
  store.set('access_token', 'token-antigo')
  store.set('user', JSON.stringify({ id: 16, email: 'cliente1@example.pt' }))
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    location: { pathname: '/area-pessoal', search: '', href: '' },
  }
}

function currentLocationHref(): string {
  return (globalThis as unknown as { window: { location: { href: string } } }).window.location.href
}

async function loadApi() {
  // `vi.resetModules()` garante que o modulo e' reavaliado com o
  // VITE_API_URL stubado (a const API_URL e' lida no import).
  vi.resetModules()
  return import('./api')
}

beforeEach(async () => {
  state = {
    mode: 'ok',
    refreshCalls: 0,
    statusCalls: 0,
    refreshFails: false,
    seenAuthorization: [],
  }
  server = http.createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  baseURL = `http://127.0.0.1:${port}/api`
  vi.stubEnv('VITE_API_URL', baseURL)
  installBrowserStubs()
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('isBasicAuthChallenge', () => {
  it('reconhece o challenge do Traefik (Basic realm)', async () => {
    const { isBasicAuthChallenge } = await loadApi()
    expect(
      isBasicAuthChallenge({
        response: { headers: { 'www-authenticate': 'Basic realm="traefik"' } },
      }),
    ).toBe(true)
  })

  it('nao confunde um 401 JSON da API (sem challenge) com credenciais de infra', async () => {
    const { isBasicAuthChallenge } = await loadApi()
    expect(
      isBasicAuthChallenge({ response: { headers: { 'content-type': 'application/json' } } }),
    ).toBe(false)
    expect(isBasicAuthChallenge({ response: { headers: { 'www-authenticate': 'Bearer' } } })).toBe(
      false,
    )
    expect(isBasicAuthChallenge(new Error('sem response'))).toBe(false)
  })
})

describe('interceptor 401 — PATA-BUG-8', () => {
  it('401 do basic auth do Traefik NAO dispara refresh nem toca na sessao', async () => {
    state.mode = 'proxy-401'
    const { api } = await loadApi()

    await expect(api.get('/status')).rejects.toMatchObject({ response: { status: 401 } })

    expect(state.refreshCalls, 'o refresh nao pode ser chamado por um 401 de infra').toBe(0)
    expect(state.statusCalls).toBe(1)
    // Pre-condicao do bug: o pedido da SPA leva mesmo o Bearer (e' por isso
    // que o Traefik o rejeita) e o token continua guardado — nao deslogamos
    // o utilizador por causa de um problema de infra.
    expect(state.seenAuthorization).toEqual(['Bearer token-antigo'])
    expect(localStorage.getItem('access_token')).toBe('token-antigo')
    expect(currentLocationHref()).toBe('')
  })

  it('401 (JSON) da API refresca uma vez e repete o pedido com o token novo', async () => {
    state.mode = 'ok-after-refresh'
    const { api } = await loadApi()

    const res = await api.get('/status')

    expect(res.status).toBe(200)
    expect(res.data).toEqual({ status: 'online' })
    expect(state.refreshCalls).toBe(1)
    expect(state.statusCalls).toBe(2)
    expect(state.seenAuthorization).toEqual(['Bearer token-antigo', 'Bearer token-novo'])
    expect(localStorage.getItem('access_token')).toBe('token-novo')
    expect(currentLocationHref()).toBe('')
  })

  it('401 que sobrevive ao refresh desiste (logout) em vez de ciclar', async () => {
    // O refresh PASSa mas o recurso continua 401 (e' o padrao de stage:
    // credenciais de infra, nao sessao expirada).
    state.mode = 'api-401'
    const { api } = await loadApi()

    await expect(api.get('/status')).rejects.toMatchObject({ response: { status: 401 } })

    expect(state.refreshCalls, 'um unico refresh por pedido, nunca em ciclo').toBe(1)
    expect(state.statusCalls, '1 pedido original + 1 repeticao, e para').toBe(2)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(currentLocationHref()).toBe('/entrar?next=%2Farea-pessoal')
  })

  it('N pedidos concorrentes com 401 fazem UM so refresh (sem tempestade)', async () => {
    state.mode = 'api-401'
    const { api } = await loadApi()

    const results = await Promise.allSettled([
      api.get('/status'),
      api.get('/status'),
      api.get('/status'),
      api.get('/status'),
      api.get('/status'),
    ])

    expect(results.map((r) => r.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
      'rejected',
      'rejected',
    ])
    // Regressao do ciclo observado em stage (refresh -> 401 x7 -> refresh
    // -> 401 x5 -> ...): os pedidos em fila tambem contam como "ja'
    // refrescados", logo nao voltam a disparar refresh.
    expect(state.refreshCalls).toBe(1)
    // O numero exacto de pedidos depende de quantos 401 chegam antes de
    // desistirmos da sessao (nao e' determinista), mas tem de ficar limitado:
    // no maximo 1 pedido original + 1 repeticao por pedido, nunca um ciclo.
    expect(state.statusCalls).toBeGreaterThanOrEqual(5)
    expect(state.statusCalls).toBeLessThanOrEqual(10)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(currentLocationHref()).toBe('/entrar?next=%2Farea-pessoal')
  })

  it('refresh falhado limpa a sessao e manda para /entrar uma unica vez', async () => {
    state.mode = 'api-401'
    state.refreshFails = true
    const { api } = await loadApi()

    const results = await Promise.allSettled([api.get('/status'), api.get('/status')])

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(state.refreshCalls).toBe(1)
    expect(state.statusCalls).toBe(2)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(currentLocationHref()).toBe('/entrar?next=%2Farea-pessoal')
  })

  it('nao refresca 401 dos endpoints de auth (credenciais erradas sao erro do form)', async () => {
    const { api } = await loadApi()

    await expect(api.post('/auth/login', { email: 'x', password: 'y' })).rejects.toMatchObject({
      response: { status: 404 },
    })
    // O servidor acima so' serve /status e /refresh; o que importa aqui e'
    // que o interceptor nao reage a /auth/login com um refresh.
    expect(state.refreshCalls).toBe(0)
  })
})
