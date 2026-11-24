/**
 * SEC-03 — o limite de 5 feedbacks/utilizador tem de ser atómico.
 *
 * A sonda do auditor provou que `count` → `create` em dois round-trips
 * independentes deixava passar 6 pedidos concorrentes com 4 linhas já
 * gravadas (6×201, 10 linhas em BD, limite 5).
 *
 * Este harness não tem Postgres. O `$transaction` falso modela a isolation
 * level Serializable de forma PESSIMISTA (um mutex: as transacções correm uma
 * de cada vez), que é uma implementação válida de serializabilidade. O
 * Postgres real usa SSI e aborta uma das transacções com P2034/40001 quando
 * detecta o ciclo read-write — esse caminho é coberto à parte, injectando os
 * erros de conflito e verificando o retry com backoff.
 *
 * Os testes correm o controller real (`createFeedback`) pelo que o ficheiro
 * carrega igual contra a versão de `HEAD` — é assim que se faz o A/B: com o
 * controller antigo o cenário de concorrência falha (10 linhas, 6×201).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

const h = vi.hoisted(() => {
  interface Row {
    id: number
    userId: number
    category: string
    title: string
    body: string
    votes: number
    createdAt: Date
    updatedAt: Date
    user: { id: number; firstName: string; lastName: string; avatarUrl: string | null }
  }

  const state = {
    rows: [] as Row[],
    nextId: 1,
    /** Latência artificial de cada round-trip, para forçar interleaving. */
    latencyMs: 2,
    /** Erros a lançar nas próximas transacções (uma entrada por chamada). */
    conflictPlan: [] as Array<{ code?: string; message?: string }>,
    txCalls: 0,
    isolationLevels: [] as Array<string | undefined>,
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const makeClient = () => ({
    feedback: {
      count: async ({ where }: { where: { userId: number } }) => {
        await sleep(state.latencyMs)
        return state.rows.filter((r) => r.userId === where.userId).length
      },
      create: async ({
        data,
      }: {
        data: { userId: number; category: string; title: string; body: string }
      }) => {
        await sleep(state.latencyMs)
        const row: Row = {
          id: state.nextId++,
          votes: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: data.userId, firstName: 'Ana', lastName: 'Silva', avatarUrl: null },
          ...data,
        }
        state.rows.push(row)
        return row
      },
      findMany: async () => state.rows,
    },
  })

  // Mutex: uma transacção Serializable de cada vez (modelo pessimista).
  let lock: Promise<unknown> = Promise.resolve()

  const client = {
    ...makeClient(),
    $transaction: <R>(
      cb: (tx: ReturnType<typeof makeClient>) => Promise<R>,
      opts?: { isolationLevel?: string },
    ): Promise<R> => {
      state.txCalls++
      state.isolationLevels.push(opts?.isolationLevel)
      const planned = state.conflictPlan.shift()
      const run = lock.then(async () => {
        if (planned) {
          const err = new Error(
            planned.message ??
              'could not serialize access due to read/write dependencies among transactions',
          ) as Error & { code?: string }
          if (planned.code) err.code = planned.code
          throw err
        }
        return cb(makeClient())
      })
      lock = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },
  }

  return { state, client }
})

vi.mock('../../lib/prisma.js', () => ({ prisma: h.client }))

vi.mock('../../lib/audit.js', () => ({ logAudit: vi.fn() }))

vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createFeedback } from './feedback.controller.js'
import { logAudit } from '../../lib/audit.js'
import { logger } from '../../lib/logger.js'
import { AppError } from '../../middleware/error-handler.js'

const mockedLogAudit = vi.mocked(logAudit)
const mockedWarn = vi.mocked(logger.warn)

interface RunResult {
  status?: number
  body?: unknown
  error?: unknown
}

/** Corre o controller (asyncHandler) e resolve no primeiro json ou next(err). */
function runController(req: Request): Promise<RunResult> {
  return new Promise((resolve) => {
    let status: number | undefined
    const res = {
      status(code: number) {
        status = code
        return res
      },
      json(body: unknown) {
        resolve({ status, body })
        return res
      },
      setHeader() {
        return res
      },
      send(body: unknown) {
        resolve({ status, body })
        return res
      },
    } as unknown as Response
    const next = (err?: unknown) => resolve({ error: err })
    createFeedback(req, res, next as NextFunction)
  })
}

function reqFor(userId = 1, n = 1): Request {
  return {
    body: {
      category: 'SUGESTAO',
      title: `Sugestão ${n}`,
      body: 'Gostaria de ver isto melhorado na plataforma.',
    },
    user: { userId, email: 'ana@example.com', role: 'OWNER' },
    ip: '127.0.0.1',
  } as unknown as Request
}

function seedRows(userId: number, count: number): void {
  for (let i = 0; i < count; i++) {
    h.state.rows.push({
      id: h.state.nextId++,
      userId,
      category: 'SUGESTAO',
      title: `Feedback ${i}`,
      body: 'Corpo suficientemente longo para o teste.',
      votes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: userId, firstName: 'Ana', lastName: 'Silva', avatarUrl: null },
    })
  }
}

const rejectedWith = (results: RunResult[], code: string) =>
  results.filter((r) => (r.error as AppError | undefined)?.code === code)

describe('SEC-03 — limite de 5 feedbacks atómico', () => {
  beforeEach(() => {
    h.state.rows.length = 0
    h.state.nextId = 1
    h.state.latencyMs = 2
    h.state.conflictPlan.length = 0
    h.state.txCalls = 0
    h.state.isolationLevels.length = 0
    vi.clearAllMocks()
  })

  it('201 no sucesso, com auditoria', async () => {
    const result = await runController(reqFor())

    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({ id: 1, hasVoted: false })
    expect(mockedLogAudit).toHaveBeenCalledTimes(1)
    expect(h.state.rows).toHaveLength(1)
  })

  it('count + create correm numa transacção Serializable', async () => {
    await runController(reqFor())

    expect(h.state.txCalls).toBe(1)
    expect(h.state.isolationLevels).toEqual(['Serializable'])
  })

  it('8 pedidos concorrentes sem feedbacks → exactamente 5 criados, 3 recusados', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => runController(reqFor(1, i))),
    )

    const created = results.filter((r) => r.status === 201)
    const refused = rejectedWith(results, 'FEEDBACK_LIMIT_REACHED')

    expect(h.state.rows).toHaveLength(5)
    expect(created).toHaveLength(5)
    expect(refused).toHaveLength(3)
    expect(refused[0].error).toBeInstanceOf(AppError)
    expect((refused[0].error as AppError).statusCode).toBe(409)
  })

  it('6 pedidos concorrentes com 4 já gravados (cenário do auditor) → 5 no total', async () => {
    seedRows(1, 4)

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => runController(reqFor(1, i))),
    )

    expect(h.state.rows).toHaveLength(5)
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect(rejectedWith(results, 'FEEDBACK_LIMIT_REACHED')).toHaveLength(5)
  })

  it('pedidos concorrentes de utilizadores diferentes não se bloqueiam entre si', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => runController(reqFor((i % 2) + 1, i))),
    )

    expect(results.every((r) => r.status === 201)).toBe(true)
    expect(h.state.rows).toHaveLength(6)
    expect(h.state.rows.filter((r) => r.userId === 1)).toHaveLength(3)
    expect(h.state.rows.filter((r) => r.userId === 2)).toHaveLength(3)
  })

  it('com o limite atingido não escreve nada e devolve a mensagem que o utilizador conhece', async () => {
    seedRows(1, 5)

    const result = await runController(reqFor())

    expect(result.error).toBeInstanceOf(AppError)
    expect((result.error as AppError).statusCode).toBe(409)
    expect((result.error as AppError).code).toBe('FEEDBACK_LIMIT_REACHED')
    expect((result.error as AppError).message).toBe('Atingiu o limite de 5 feedbacks. Obrigado!')
    expect(h.state.rows).toHaveLength(5)
    expect(mockedLogAudit).not.toHaveBeenCalled()
  })

  describe('retry em conflito de serialização', () => {
    it('P2034 na 1ª tentativa → retry e sucesso à 2ª', async () => {
      h.state.conflictPlan.push({ code: 'P2034' })

      const result = await runController(reqFor())

      expect(result.status).toBe(201)
      expect(h.state.txCalls).toBe(2)
      expect(h.state.rows).toHaveLength(1)
    })

    it('SQLSTATE 40001 (serialization_failure) também faz retry', async () => {
      h.state.conflictPlan.push({ code: '40001' })

      const result = await runController(reqFor())

      expect(result.status).toBe(201)
      expect(h.state.txCalls).toBe(2)
    })

    it('deadlock (40P01) também faz retry', async () => {
      h.state.conflictPlan.push({ code: '40P01' })

      await runController(reqFor())

      expect(h.state.txCalls).toBe(2)
    })

    it('mensagem de conflito sem código também faz retry', async () => {
      h.state.conflictPlan.push({ message: 'could not serialize access due to concurrent update' })

      const result = await runController(reqFor())

      expect(result.status).toBe(201)
      expect(h.state.txCalls).toBe(2)
    })

    it('espera entre tentativas (backoff)', async () => {
      h.state.conflictPlan.push({ code: 'P2034' })
      const startedAt = performance.now()

      await runController(reqFor())

      // A 1ª tentativa espera RETRY_BASE_DELAY_MS (10ms) antes de repetir.
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(8)
    })

    it('3 conflitos seguidos → 409 FEEDBACK_WRITE_CONFLICT (nunca a mensagem do limite)', async () => {
      h.state.conflictPlan.push({ code: 'P2034' }, { code: 'P2034' }, { code: 'P2034' })

      const result = await runController(reqFor())

      expect(result.error).toBeInstanceOf(AppError)
      expect((result.error as AppError).statusCode).toBe(409)
      expect((result.error as AppError).code).toBe('FEEDBACK_WRITE_CONFLICT')
      expect((result.error as AppError).message).not.toContain('limite de 5')
      expect(h.state.txCalls).toBe(3)
      expect(h.state.rows).toHaveLength(0)
      expect(mockedWarn).toHaveBeenCalledTimes(1)
    })

    it('erro não relacionado com conflito não é retentado', async () => {
      h.state.conflictPlan.push({
        code: 'P2021',
        message: 'The table `public.feedback` does not exist in the current database.',
      })

      const result = await runController(reqFor())

      expect(result.error).toBeInstanceOf(Error)
      expect((result.error as Error).message).toContain('does not exist')
      expect(h.state.txCalls).toBe(1)
    })
  })
})
