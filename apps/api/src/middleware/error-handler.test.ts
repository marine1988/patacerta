// ============================================
// PataCerta — Error handler: stack só em dev (SEC-10)
// ============================================
//
// `lib/env.ts` lê NODE_ENV em module-load, por isso cada cenário recarrega o
// registry de módulos depois de fixar NODE_ENV (`vi.resetModules` + `vi.stubEnv`).
// O NODE_ENV original é sempre reposto — o pool de testes (`forks`, singleFork)
// partilha `process.env` entre ficheiros.

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  REDACT_PATHS: [],
  REDACT_CENSOR: '[REDACTED]',
}))

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

type ErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => void

interface MockRes {
  res: Response
  status: ReturnType<typeof vi.fn>
  json: ReturnType<typeof vi.fn>
}

async function loadHandler(nodeEnv: string): Promise<{ handler: ErrorHandler; logger: unknown }> {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', nodeEnv)
  const { errorHandler } = await import('./error-handler.js')
  const { logger } = await import('../lib/logger.js')
  return { handler: errorHandler as ErrorHandler, logger }
}

function makeRes(): MockRes {
  const status = vi.fn()
  const json = vi.fn()
  const res = { status, json } as unknown as Response
  status.mockReturnValue(res)
  return { res, status, json }
}

function loggedObject(logger: unknown): Record<string, unknown> {
  const calls = (logger as { error: { mock: { calls: unknown[][] } } }).error.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[0][0] as Record<string, unknown>
}

const SECRET_STACK =
  'Error: falhou a ligação\n    at /srv/apps/api/dist/lib/prisma.js:42:13\n    at process.processTicksAndRejections'

function failingError(): Error {
  const err = new Error('falhou a ligação à base de dados')
  err.stack = SECRET_STACK
  return err
}

const noopNext = vi.fn() as unknown as NextFunction

describe('errorHandler — stack trace por ambiente', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV
  })

  it('em production não regista stack nem a devolve ao cliente', async () => {
    const { handler, logger } = await loadHandler('production')
    const { res, status, json } = makeRes()

    handler(failingError(), {} as Request, res, noopNext)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' })

    const logged = loggedObject(logger)
    expect(logged).not.toHaveProperty('stack')
    expect(logged.message).toBe('falhou a ligação à base de dados')
    expect(JSON.stringify(logged)).not.toContain('prisma.js')

    const consolePayload = consoleSpy.mock.calls[0]?.[1] as Record<string, unknown>
    expect(consolePayload).not.toHaveProperty('stack')
  })

  it('em stage (NODE_ENV=stage) também não regista stack nem o devolve ao cliente', async () => {
    const { handler, logger } = await loadHandler('stage')
    const { res, status, json } = makeRes()

    handler(failingError(), {} as Request, res, noopNext)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' })
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('prisma.js')

    const logged = loggedObject(logger)
    expect(logged).not.toHaveProperty('stack')
    expect(JSON.stringify(logged)).not.toContain('/srv/apps/api')

    const consolePayload = consoleSpy.mock.calls[0]?.[1] as Record<string, unknown>
    expect(consolePayload).not.toHaveProperty('stack')
  })

  it('em dev local mantém o stack no log (mas nunca na resposta)', async () => {
    const { handler, logger } = await loadHandler('development')
    const { res, status, json } = makeRes()

    handler(failingError(), {} as Request, res, noopNext)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' })
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('prisma.js')

    const logged = loggedObject(logger)
    expect(logged.stack).toBe(SECRET_STACK)
  })

  it('AppError não é afectado e não loga nada', async () => {
    const { handler, logger } = await loadHandler('stage')
    const { res, status, json } = makeRes()
    const { AppError } = await import('./error-handler.js')

    handler(new AppError(404, 'Não encontrado', 'NOT_FOUND'), {} as Request, res, noopNext)

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ error: 'Não encontrado', code: 'NOT_FOUND' })
    expect((logger as { error: { mock: { calls: unknown[][] } } }).error.mock.calls).toHaveLength(0)
  })
})
