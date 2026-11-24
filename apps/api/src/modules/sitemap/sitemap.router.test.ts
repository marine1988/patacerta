// ============================================
// PataCerta — Sitemap Router Tests
// ============================================
//
// Regressão PATA-BUG-7: o sitemap servido por stage.patacerta.pt anunciava
// `<loc>https://patacerta.pt/…</loc>` (URLs de PRODUÇÃO) porque faltava
// `PUBLIC_URL` e o código tinha um default silencioso apontado a produção.
//
// Aqui o router é montado num Express real e servido em `127.0.0.1` (porta
// efémera) — o assert é sobre o XML que sai do endpoint, não sobre a
// expressão que o constrói. Prisma é mockado (sem Postgres nesta máquina).
//
// `PUBLIC_URL`/`FRONTEND_URL` são lidas por pedido (`getPublicBaseUrl`), por
// isso podem ser trocadas entre casos sem recarregar o módulo.

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { cacheDelPrefix } from '../../lib/cache.js'

const breederFindMany = vi.fn()
const serviceFindMany = vi.fn()

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    breeder: { findMany: (...args: unknown[]) => breederFindMany(...args) },
    service: { findMany: (...args: unknown[]) => serviceFindMany(...args) },
  },
}))

const ORIGINAL_ENV = {
  PUBLIC_URL: process.env.PUBLIC_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
}

function setEnv(key: 'PUBLIC_URL' | 'FRONTEND_URL', value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

let server: Server
let baseUrl = ''

beforeAll(async () => {
  const { sitemapRouter } = await import('./sitemap.router.js')
  const app = express()
  app.use('/', sitemapRouter)
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server?.close()
})

beforeEach(async () => {
  // O router guarda o XML em cache (`cacheGetOrSet`, Redis ou Map in-process).
  // Sem Redis em testes cai no Map do módulo, que sobrevive entre casos deste
  // ficheiro — limpar a família de chaves mantém cada caso independente.
  await cacheDelPrefix('sitemap:xml:')
  breederFindMany.mockReset()
  serviceFindMany.mockReset()
  breederFindMany.mockResolvedValue([
    { id: 1, slug: 'canil-do-norte', updatedAt: new Date('2026-01-02T03:04:05.000Z') },
  ])
  serviceFindMany.mockResolvedValue([
    { id: 2, slug: 'passeios-da-dora', updatedAt: new Date('2026-01-02T03:04:05.000Z') },
  ])
})

afterEach(() => {
  setEnv('PUBLIC_URL', ORIGINAL_ENV.PUBLIC_URL)
  setEnv('FRONTEND_URL', ORIGINAL_ENV.FRONTEND_URL)
})

async function getSitemap(): Promise<{
  status: number
  contentType: string
  cacheControl: string
  locs: string[]
  xml: string
}> {
  const res = await fetch(`${baseUrl}/sitemap.xml`)
  const xml = await res.text()
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    cacheControl: res.headers.get('cache-control') ?? '',
    xml,
    locs: [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.trim()),
  }
}

describe('GET /sitemap.xml — origem canónica dos <loc> (PATA-BUG-7)', () => {
  // O caso exato do bug: stage não define PUBLIC_URL e caía no default de
  // produção. Toda a sitemap (estáticas + criadores + serviços) tem de sair
  // com o host que a serve.
  it('sem PUBLIC_URL usa FRONTEND_URL e não anuncia o domínio de produção', async () => {
    setEnv('PUBLIC_URL', undefined)
    setEnv('FRONTEND_URL', 'https://stage.patacerta.pt')

    const { status, contentType, locs } = await getSitemap()

    expect(status).toBe(200)
    expect(contentType.toLowerCase()).toContain('xml')
    expect(locs.length).toBeGreaterThan(3)
    for (const loc of locs) {
      expect(loc.startsWith('http'), `URL não absoluta: ${loc}`).toBe(true)
      expect(
        loc.startsWith('https://stage.patacerta.pt'),
        `sitemap com URL de outro domínio: ${loc}`,
      ).toBe(true)
    }
    // As entradas dinâmicas também, não só as estáticas.
    expect(locs).toContain('https://stage.patacerta.pt/criador/canil-do-norte')
    expect(locs).toContain('https://stage.patacerta.pt/servicos/passeios-da-dora')
  })

  it('PUBLIC_URL tem prioridade sobre FRONTEND_URL (e perde o trailing slash)', async () => {
    setEnv('PUBLIC_URL', 'https://stage.patacerta.pt/')
    setEnv('FRONTEND_URL', 'https://patacerta.pt')

    const { locs } = await getSitemap()

    expect(locs).toContain('https://stage.patacerta.pt/pesquisar')
    expect(locs.some((l) => l.includes('patacerta.pt/') && !l.startsWith('https://stage.'))).toBe(
      false,
    )
  })

  // `FRONTEND_URL` aceita lista separada por vírgulas: ler a env crua metia a
  // lista inteira num `<loc>` e produzia uma URL inválida.
  it('FRONTEND_URL com CSV usa apenas a primeira entrada', async () => {
    setEnv('PUBLIC_URL', undefined)
    setEnv('FRONTEND_URL', 'https://stage.patacerta.pt,https://outro.example.com')

    const { locs } = await getSitemap()

    for (const loc of locs) {
      expect(loc).not.toContain(',')
      expect(loc.startsWith('https://stage.patacerta.pt')).toBe(true)
    }
  })
})

// ============================================
// SEC-04 — cache do XML
// ============================================
//
// O endpoint fazia 2 `findMany` (take 10000) por pedido e está isento de rate
// limit: um crawler em ciclo forçava dois full scans por pedido. O XML passa a
// ser servido de um cache (Redis / Map in-process) com TTL curto.
//
// Invariantes que interessam:
//  1. a segunda chamada NÃO consulta a DB e devolve XML byte-idêntico;
//  2. `Cache-Control` não muda (é para o browser/proxy, não substitui o cache);
//  3. hosts diferentes não partilham a entrada (a sitemap anuncia sempre o host
//     que a serve — PATA-BUG-7 regressaria em silêncio com uma chave estática);
//  4. uma falha do loader não fica cacheada (sem cache negativo).
describe('GET /sitemap.xml — cache (SEC-04)', () => {
  it('serve da cache e não repete as queries na segunda chamada', async () => {
    setEnv('PUBLIC_URL', 'https://cache-hit.patacerta.test')
    setEnv('FRONTEND_URL', undefined)

    const first = await getSitemap()

    expect(first.status).toBe(200)
    expect(first.contentType.toLowerCase()).toContain('xml')
    expect(first.cacheControl).toBe('public, max-age=3600')
    expect(breederFindMany).toHaveBeenCalledTimes(1)
    expect(serviceFindMany).toHaveBeenCalledTimes(1)

    const second = await getSitemap()

    expect(second.status).toBe(200)
    expect(second.cacheControl).toBe('public, max-age=3600')
    expect(second.xml).toBe(first.xml)
    // O ponto do card: nenhuma query nova na segunda chamada.
    expect(breederFindMany).toHaveBeenCalledTimes(1)
    expect(serviceFindMany).toHaveBeenCalledTimes(1)
  })

  it('hosts diferentes não partilham a entrada de cache', async () => {
    setEnv('PUBLIC_URL', 'https://host-a.patacerta.test')
    setEnv('FRONTEND_URL', undefined)
    const hostA = await getSitemap()

    setEnv('PUBLIC_URL', 'https://host-b.patacerta.test')
    const hostB = await getSitemap()

    expect(breederFindMany).toHaveBeenCalledTimes(2)
    expect(hostA.locs.every((l) => l.startsWith('https://host-a.patacerta.test'))).toBe(true)
    expect(hostB.locs.every((l) => l.startsWith('https://host-b.patacerta.test'))).toBe(true)
  })

  it('falha do loader não fica em cache (o pedido seguinte volta a consultar)', async () => {
    setEnv('PUBLIC_URL', 'https://cache-fail.patacerta.test')
    setEnv('FRONTEND_URL', undefined)
    breederFindMany.mockRejectedValueOnce(new Error('db indisponivel'))

    const failed = await getSitemap()
    expect(failed.status).toBe(500)

    const retried = await getSitemap()
    expect(retried.status).toBe(200)
    expect(breederFindMany).toHaveBeenCalledTimes(2)
    expect(retried.locs).toContain('https://cache-fail.patacerta.test/criador/canil-do-norte')
  })
})
