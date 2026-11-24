// ============================================
// PataCerta — Logger: redact paths (SEC-06)
// ============================================
//
// Prova que o JWT transportado em `X-Access-Token` (ACCESS_TOKEN_HEADER em
// middleware/auth.ts) nunca sai em claro num log. O teste corre uma instância
// de pino sobre a MESMA lista exportada por logger.ts — se alguém remover o
// caminho da configuração real, este teste falha.

import { describe, it, expect } from 'vitest'
import pino from 'pino'
import { REDACT_PATHS, REDACT_CENSOR } from './logger.js'

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjF9.assinatura-falsa-do-teste-123456'

function captureLogger() {
  const lines: string[] = []
  const instance = pino(
    { redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR } },
    {
      write(chunk: string) {
        lines.push(chunk)
      },
    },
  )
  return { instance, lines }
}

/** Serializa uma entrada de log e devolve o objeto JSON. */
function logAndParse(payload: Record<string, unknown>): Record<string, unknown> {
  const { instance, lines } = captureLogger()
  instance.info(payload, 'pedido recebido')
  expect(lines).toHaveLength(1)
  expect(lines[0]).not.toContain(JWT)
  return JSON.parse(lines[0]) as Record<string, unknown>
}

describe('logger redact', () => {
  it('redige o JWT em req.headers["x-access-token"]', () => {
    const parsed = logAndParse({ req: { headers: { 'x-access-token': JWT } } })
    const headers = (parsed.req as { headers: Record<string, unknown> }).headers
    expect(headers['x-access-token']).toBe(REDACT_CENSOR)
  })

  it('redige a variante de capitalização do mesmo header', () => {
    const parsed = logAndParse({ req: { headers: { 'X-Access-Token': JWT } } })
    const headers = (parsed.req as { headers: Record<string, unknown> }).headers
    expect(headers['X-Access-Token']).toBe(REDACT_CENSOR)
  })

  it('redige um eventual x-refresh-token', () => {
    const parsed = logAndParse({ req: { headers: { 'x-refresh-token': JWT } } })
    const headers = (parsed.req as { headers: Record<string, unknown> }).headers
    expect(headers['x-refresh-token']).toBe(REDACT_CENSOR)
  })

  it('mantém authorization e cookie redigidos (regressão)', () => {
    const parsed = logAndParse({
      req: { headers: { authorization: `Bearer ${JWT}`, cookie: 'refresh_token=abc123' } },
    })
    const headers = (parsed.req as { headers: Record<string, unknown> }).headers
    expect(headers.authorization).toBe(REDACT_CENSOR)
    expect(headers.cookie).toBe(REDACT_CENSOR)
  })

  it('não mexe em campos não sensíveis', () => {
    const parsed = logAndParse({
      req: { headers: { 'user-agent': 'Mozilla/5.0', 'x-access-token': JWT } },
      route: '/api/feedback',
    })
    const headers = (parsed.req as { headers: Record<string, unknown> }).headers
    expect(headers['user-agent']).toBe('Mozilla/5.0')
    expect(parsed.route).toBe('/api/feedback')
  })
})
