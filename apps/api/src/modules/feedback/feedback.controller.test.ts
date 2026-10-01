// ============================================
// PataCerta — Feedback Controller Tests
// ============================================
//
// Convenção (igual a payments.controller.test.ts): asyncHandler propaga
// erros via next(err) e é fire-and-forget (`fn(...).catch(next)`), por isso
// não basta `await handler(...)`. Usamos `invoke()` para drenar microtasks
// até `res.json` ou `next` terem sido chamados.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

vi.mock('../../lib/prisma.js', () => {
  const prismaMock: Record<string, unknown> = {
    feedback: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    feedbackVote: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  }
  // $transaction(callback) invoca o callback com o próprio prisma mock.
  prismaMock.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
    cb(prismaMock),
  )
  return { prisma: prismaMock }
})

vi.mock('../../lib/audit.js', () => ({
  logAudit: vi.fn(),
}))

import {
  listFeedback,
  createFeedback,
  voteFeedback,
  unvoteFeedback,
} from './feedback.controller.js'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'

const mockedPrisma = vi.mocked(prisma, true)

function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  }
}

/**
 * Invoca o handler (já envolvido em asyncHandler) e drena microtasks até
 * `res.json` ou `next` terem sido chamados.
 */
async function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  handler(req, res, next)
  const resJson = (res as unknown as { json: ReturnType<typeof vi.fn> }).json
  const nextMock = next as unknown as { mock: { calls: unknown[][] } }
  for (let i = 0; i < 50; i++) {
    if (nextMock.mock.calls.length > 0 || resJson.mock.calls.length > 0) return
    await new Promise((r) => setImmediate(r))
  }
}

const noopNext = () => vi.fn() as unknown as NextFunction

describe('feedback.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listFeedback', () => {
    it('returns paginated feedback sorted by votes', async () => {
      const mockFeedback = [
        {
          id: 1,
          userId: 1,
          category: 'BUG',
          title: 'Test',
          body: 'Test body',
          votes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 1, firstName: 'João', lastName: 'Silva', avatarUrl: null },
        },
      ]
      mockedPrisma.feedback.findMany.mockResolvedValue(mockFeedback as never)
      mockedPrisma.feedback.count.mockResolvedValue(1)

      const req = {
        query: { page: '1', limit: '20', sort: 'votes' },
        user: undefined,
      } as unknown as Request
      const res = createMockResponse()

      await invoke(listFeedback, req, res, noopNext())

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ id: 1, hasVoted: false })]),
          meta: expect.objectContaining({ total: 1 }),
        }),
      )
      // Anónimo: não consulta os votos do utilizador.
      expect(mockedPrisma.feedbackVote.findMany).not.toHaveBeenCalled()
    })

    it('marks hasVoted=true for items the user voted on', async () => {
      const mockFeedback = [
        {
          id: 1,
          userId: 2,
          category: 'BUG',
          title: 'Test',
          body: 'Test body',
          votes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 2, firstName: 'João', lastName: 'Silva', avatarUrl: null },
        },
      ]
      mockedPrisma.feedback.findMany.mockResolvedValue(mockFeedback as never)
      mockedPrisma.feedback.count.mockResolvedValue(1)
      mockedPrisma.feedbackVote.findMany.mockResolvedValue([
        { id: 1, userId: 1, feedbackId: 1, createdAt: new Date() },
      ] as never)

      const req = {
        query: { page: '1', limit: '20', sort: 'votes' },
        user: { userId: 1, role: 'OWNER' },
      } as unknown as Request
      const res = createMockResponse()

      await invoke(listFeedback, req, res, noopNext())

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ id: 1, hasVoted: true })]),
        }),
      )
    })
  })

  describe('createFeedback', () => {
    it('creates feedback and returns 201', async () => {
      const mockCreated = {
        id: 1,
        userId: 1,
        category: 'SUGESTAO',
        title: 'Nova funcionalidade',
        body: 'Gostaria de ver...',
        votes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 1, firstName: 'João', lastName: 'Silva', avatarUrl: null },
      }
      mockedPrisma.feedback.create.mockResolvedValue(mockCreated as never)

      const req = {
        body: { category: 'SUGESTAO', title: 'Nova funcionalidade', body: 'Gostaria de ver...' },
        user: { userId: 1, role: 'OWNER' },
        ip: '127.0.0.1',
      } as unknown as Request
      const res = createMockResponse()

      await invoke(createFeedback, req, res, noopNext())

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, hasVoted: false }))
    })
  })

  describe('voteFeedback', () => {
    it('creates vote and increments count', async () => {
      const mockUpdated = {
        id: 1,
        userId: 2,
        category: 'BUG',
        title: 'Test',
        body: 'Test body',
        votes: 6,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 2, firstName: 'João', lastName: 'Silva', avatarUrl: null },
      }

      mockedPrisma.feedback.findUnique.mockResolvedValue({ id: 1, userId: 2 } as never)
      mockedPrisma.feedbackVote.create.mockResolvedValue({} as never)
      mockedPrisma.feedback.update.mockResolvedValue(mockUpdated as never)

      const req = {
        params: { id: '1' },
        user: { userId: 1, role: 'OWNER' },
        ip: '127.0.0.1',
      } as unknown as Request
      const res = createMockResponse()

      await invoke(voteFeedback, req, res, noopNext())

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, hasVoted: true, votes: 6 }),
      )
      expect(mockedPrisma.feedbackVote.create).toHaveBeenCalledWith({
        data: { feedbackId: 1, userId: 1 },
      })
    })

    it('propagates 404 when feedback not found', async () => {
      mockedPrisma.feedback.findUnique.mockResolvedValue(null)

      const req = {
        params: { id: '999' },
        user: { userId: 1, role: 'OWNER' },
        ip: '127.0.0.1',
      } as unknown as Request
      const res = createMockResponse()
      const next = vi.fn()

      await invoke(voteFeedback, req, res, next as unknown as NextFunction)

      expect(next).toHaveBeenCalledWith(expect.any(AppError))
      const err = (next as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0] as AppError
      expect(err.statusCode).toBe(404)
    })

    it('propagates 400 when voting on own feedback', async () => {
      mockedPrisma.feedback.findUnique.mockResolvedValue({ id: 1, userId: 1 } as never)

      const req = {
        params: { id: '1' },
        user: { userId: 1, role: 'OWNER' },
        ip: '127.0.0.1',
      } as unknown as Request
      const res = createMockResponse()
      const next = vi.fn()

      await invoke(voteFeedback, req, res, next as unknown as NextFunction)

      expect(next).toHaveBeenCalledWith(expect.any(AppError))
      const err = (next as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0] as AppError
      expect(err.statusCode).toBe(400)
    })
  })

  describe('unvoteFeedback', () => {
    it('removes vote and decrements count', async () => {
      const mockUpdated = {
        id: 1,
        userId: 2,
        category: 'BUG',
        title: 'Test',
        body: 'Test body',
        votes: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 2, firstName: 'João', lastName: 'Silva', avatarUrl: null },
      }

      mockedPrisma.feedback.findUnique.mockResolvedValue({ id: 1, userId: 2 } as never)
      mockedPrisma.feedbackVote.deleteMany.mockResolvedValue({ count: 1 } as never)
      mockedPrisma.feedback.update.mockResolvedValue(mockUpdated as never)

      const req = {
        params: { id: '1' },
        user: { userId: 1, role: 'OWNER' },
        ip: '127.0.0.1',
      } as unknown as Request
      const res = createMockResponse()

      await invoke(unvoteFeedback, req, res, noopNext())

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, hasVoted: false, votes: 4 }),
      )
    })

    it('propagates 400 when user has not voted', async () => {
      mockedPrisma.feedback.findUnique.mockResolvedValue({ id: 1, userId: 2 } as never)
      mockedPrisma.feedbackVote.deleteMany.mockResolvedValue({ count: 0 } as never)

      const req = {
        params: { id: '1' },
        user: { userId: 1, role: 'OWNER' },
        ip: '127.0.0.1',
      } as unknown as Request
      const res = createMockResponse()
      const next = vi.fn()

      await invoke(unvoteFeedback, req, res, next as unknown as NextFunction)

      expect(next).toHaveBeenCalledWith(expect.any(AppError))
      const err = (next as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0] as AppError
      expect(err.statusCode).toBe(400)
    })
  })
})
