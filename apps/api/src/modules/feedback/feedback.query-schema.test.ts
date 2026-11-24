// ============================================
// PataCerta — Paginação do feedback: bound de `page` (SEC-05)
// ============================================
//
// `skip = (page - 1) * limit` alimenta o OFFSET do Prisma. Sem bound, um `page`
// gigante (ou fora do range 64-bit) rebenta na validação do Prisma e a API
// responde 500 — um erro do cliente disfarçado de erro do servidor. O teste
// cobre o schema partilhado e a cadeia real `validate` → `errorHandler`, que é
// o que a rota `/api/admin/feedback` usa.

import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { listFeedbackSchema } from '@patacerta/shared'
import { validate } from '../../middleware/validate.js'
import { errorHandler } from '../../middleware/error-handler.js'

describe('listFeedbackSchema — bound de page', () => {
  it('aplica os defaults (page=1, limit=20, sort=recent)', () => {
    expect(listFeedbackSchema.parse({})).toEqual({ page: 1, limit: 20, sort: 'recent' })
  })

  it('aceita o limite superior (page=10000)', () => {
    const parsed = listFeedbackSchema.parse({ page: '10000' })
    expect(parsed.page).toBe(10000)
  })

  it('rejeita page acima do bound', () => {
    const result = listFeedbackSchema.safeParse({ page: '10001' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['page'])
    }
  })

  it('rejeita page fora do range 64-bit (era 500 no Prisma, passa a erro de validação)', () => {
    const result = listFeedbackSchema.safeParse({ page: '999999999999999999999' })
    expect(result.success).toBe(false)
  })

  it('rejeita page zero ou negativo', () => {
    expect(listFeedbackSchema.safeParse({ page: '0' }).success).toBe(false)
    expect(listFeedbackSchema.safeParse({ page: '-3' }).success).toBe(false)
  })

  it('mantém o bound de limit (1..50)', () => {
    expect(listFeedbackSchema.safeParse({ limit: '51' }).success).toBe(false)
    expect(listFeedbackSchema.parse({ limit: '50' }).limit).toBe(50)
  })
})

describe('GET /api/admin/feedback — page inválido responde 400 (não 500)', () => {
  function makeRes() {
    const status = vi.fn()
    const json = vi.fn()
    const res = { status, json } as unknown as Response
    status.mockReturnValue(res)
    return { res, status, json }
  }

  it('a middleware de validação entrega ZodError e o handler devolve 400', () => {
    const req = { query: { page: '999999999999999999999' } } as unknown as Request
    const { res, status, json } = makeRes()
    const next = vi.fn()

    validate(listFeedbackSchema, 'query')(req, res, next as unknown as NextFunction)

    const err = (next.mock.calls[0] as unknown[])[0]
    expect(err).toBeInstanceOf(ZodError)

    errorHandler(err as Error, req, res, vi.fn() as unknown as NextFunction)

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR', error: 'Dados inválidos' }),
    )
  })

  it('query válido passa a validação com valores coeridos', () => {
    const req = { query: { page: '2', limit: '10', category: 'BUG' } } as unknown as Request
    const { res } = makeRes()
    const next = vi.fn()

    validate(listFeedbackSchema, 'query')(req, res, next as unknown as NextFunction)

    expect(next).toHaveBeenCalledWith()
    expect((req as unknown as { query: Record<string, unknown> }).query).toEqual({
      page: 2,
      limit: 10,
      category: 'BUG',
      sort: 'recent',
    })
  })
})
