// ============================================
// PataCerta — Health/Status Router Tests
// ============================================
//
// Regressão PATA-CI-7: `/api/status` passa a expor `uptimeSeconds`
// (aditivo) para servir de âncora de deploy em commits API-only, onde o
// `Last-Modified` do web não muda. O campo é `Math.round(process.uptime())`.
//
// O router é montado num Express real e servido em 127.0.0.1 (porta efémera).
// Prisma é mockado (sem Postgres nesta máquina) — só o `/` do statusRouter
// é exercitado.

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import express from 'express'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

let server: Server
let baseUrl = ''

beforeAll(async () => {
  const { statusRouter } = await import('./health.router.js')
  const app = express()
  app.use('/', statusRouter)
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server?.close()
})

describe('GET /api/status — uptimeSeconds (PATA-CI-7)', () => {
  it('devolve status online, timestamp e uptimeSeconds numérico >= 0', async () => {
    const res = await fetch(`${baseUrl}/`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      timestamp: string
      uptimeSeconds: number
    }
    expect(body.status).toBe('online')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.uptimeSeconds).toBe('number')
    expect(Number.isInteger(body.uptimeSeconds)).toBe(true)
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })

  it('uptimeSeconds é monotónico (segunda chamada >= primeira)', async () => {
    const r1 = await fetch(`${baseUrl}/`)
    const b1 = (await r1.json()) as { uptimeSeconds: number }
    // Pequena pausa para garantir incremento perceptível (uptime em segundos).
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const r2 = await fetch(`${baseUrl}/`)
    const b2 = (await r2.json()) as { uptimeSeconds: number }
    expect(b2.uptimeSeconds).toBeGreaterThanOrEqual(b1.uptimeSeconds)
  })
})
