/**
 * Contrato da API pública — @prod-safe (read-only).
 *
 * O frontend depende destes endpoints para tudo o que mostra. Não existia
 * NENHUM teste de contrato dos endpoints públicos (só payments/webhooks têm
 * testes unitários), pelo que uma mudança de envelope (`{data,meta}` vs
 * `{items}`) ou um campo renomeado só se descobria em produção.
 *
 * Estes testes correm contra QUALQUER ambiente, incluindo produção: são
 * GETs puros + um POST inválido que é rejeitado na validação (não escreve).
 */

import { test, expect } from '../fixtures/test'
import { API_BASE_URL } from '../fixtures/demo-data'

test.describe('Contrato da API pública @prod-safe', () => {
  test('GET /api/health → ok com base de dados ligada', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/health`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as {
      status?: string
      services?: { database?: string }
      timestamp?: string
    }
    expect(body.status).toBe('ok')
    expect(body.services?.database).toBe('connected')
    expect(Number.isNaN(Date.parse(body.timestamp ?? ''))).toBe(false)
  })

  test('GET /api/status → online (fonte do modo manutenção)', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/status`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as { status?: string; timestamp?: string }
    // O frontend só activa manutenção quando `status !== 'online'`.
    // Ver AGENTS.md §7: a web usa /api/status (sem bypass), NÃO /api/health.
    expect(body.status).toBe('online')
    expect(Number.isNaN(Date.parse(body.timestamp ?? ''))).toBe(false)
  })

  test('GET /api/home/featured → envelope com breeders e services', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/home/featured`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as { breeders?: unknown[]; services?: unknown[] }
    expect(Array.isArray(body.breeders)).toBe(true)
    expect(Array.isArray(body.services)).toBe(true)
    // A home não pode devolver mais do que os 12 por secção documentados.
    expect(body.breeders!.length).toBeLessThanOrEqual(12)
    expect(body.services!.length).toBeLessThanOrEqual(12)
  })

  test('GET /api/services → lista paginada com meta coerente', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/services?limit=2`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as {
      data?: Array<{ id?: number; title?: string; priceCents?: number; priceUnit?: string }>
      meta?: { page?: number; limit?: number; total?: number; totalPages?: number }
    }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta?.page).toBe(1)
    expect(body.meta?.limit).toBe(2)
    expect(typeof body.meta?.total).toBe('number')
    // cobertura de página: o que veio nunca pode exceder o pedido
    expect(body.data!.length).toBeLessThanOrEqual(2)
    expect(body.meta!.totalPages!).toBe(Math.ceil(body.meta!.total! / body.meta!.limit!))

    for (const item of body.data!) {
      expect(typeof item.id).toBe('number')
      expect(typeof item.title).toBe('string')
      expect(item.title!.length).toBeGreaterThan(0)
      expect(typeof item.priceCents).toBe('number')
      // preço não pode ser negativo (preço é guardado em cêntimos)
      expect(item.priceCents!).toBeGreaterThanOrEqual(0)
    }
  })

  test('GET /api/breeds → catálogo populado com slug e nome pt', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/breeds`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as Array<{
      id?: number
      nameSlug?: string
      namePt?: string
    }>
    expect(Array.isArray(body)).toBe(true)
    // O catálogo de raças é seed fixo (~104) e o simulador depende dele.
    expect(body.length).toBeGreaterThan(50)

    for (const breed of body.slice(0, 10)) {
      expect(typeof breed.id).toBe('number')
      expect(breed.nameSlug).toMatch(/^[a-z0-9-]+$/)
      expect((breed.namePt ?? '').length).toBeGreaterThan(0)
    }
  })

  test('GET /api/search/breeders → envelope {data,meta} mesmo vazio', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/search/breeders?limit=2`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as {
      data?: unknown[]
      meta?: { page?: number; limit?: number; total?: number }
    }
    // Contrato: o frontend lê `data ?? items` (fixtures/api.ts) — aqui
    // garantimos que o envelope canónico é `{data, meta}`.
    expect(Array.isArray(body.data)).toBe(true)
    expect(typeof body.meta?.total).toBe('number')
    expect(body.data!.length).toBeLessThanOrEqual(2)
  })

  test('payload inválido devolve erro de validação em JSON (nunca 500/HTML)', async ({
    request,
  }) => {
    const res = await request.post(`${API_BASE_URL}/auth/login`, { data: {} })

    expect(res.status()).toBe(400)
    expect((res.headers()['content-type'] ?? '').toLowerCase()).toContain('json')

    const body = (await res.json()) as {
      error?: string
      code?: string
      details?: Array<{ path?: string }>
    }
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(typeof body.error).toBe('string')
    expect(body.error!.length).toBeGreaterThan(0)
    // Mensagens ao utilizador final têm de ser pt-PT (AGENTS.md §6).
    expect(body.details?.some((d) => d.path === 'email')).toBe(true)
    expect(body.details?.some((d) => d.path === 'password')).toBe(true)
  })

  test('respostas da API trazem headers de segurança e rate-limit', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/health`)
    const headers = res.headers()

    // Helmet está montado na API (confirmado em produção).
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBeTruthy()
    expect(headers['strict-transport-security']).toContain('max-age=')
    // Rate-limit exposto — sem isto não se detecta 429 precocemente.
    expect(headers['x-ratelimit-limit']).toBeTruthy()
    expect(headers['x-ratelimit-remaining']).toBeTruthy()
  })

  test('401 da API não expõe stacktrace e é JSON', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/users/me`)
    expect(res.status()).toBe(401)
    expect((res.headers()['content-type'] ?? '').toLowerCase()).toContain('json')

    const text = await res.text()
    // Um stacktrace/ficheiro .ts no corpo é fuga de informação interna.
    expect(text).not.toMatch(/at Object\.|node_modules|\.ts:\d+:\d+/)

    const body = JSON.parse(text) as { error?: string; code?: string }
    expect(typeof body.error).toBe('string')
    expect(body.error!.length).toBeGreaterThan(0)
  })
})
