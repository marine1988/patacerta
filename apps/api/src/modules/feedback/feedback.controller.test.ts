// ============================================
// PataCerta — Feedback Controller Tests
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

vi.mock('../../lib/prisma.js', () => {
  const prismaMock: Record<string, unknown> = {
    feedback: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    feedbackVote: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  }
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
  getMyFeedback,
  createFeedback,
  exportFeedback,
} from './feedback.controller.js'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'

const mockedPrisma = vi.mocked(prisma, true)

function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    setHeader: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
}

async function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  handler(req, res, next)
  const resJson = (res as unknown as { json: ReturnType<typeof vi.fn> }).json
  const resSend = (res as unknown as { send: ReturnType<typeof vi.fn> }).send
  const nextMock = next as unknown as { mock: { calls: unknown[][] } }
  for (let i = 0; i < 50; i++) {
    if (
      nextMock.mock.calls.length > 0 ||
      resJson.mock.calls.length > 0 ||
      resSend.mock.calls.length > 0
    )
      return
    await new Promise((r) => setImmediate(r))
  }
}

const noopNext = () => vi.fn() as unknown as NextFunction

describe('feedback.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listFeedback', () => {
    it('returns paginated feedback sorted by createdAt desc', async () => {
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
        query: { page: '1', limit: '20' },
        user: { userId: 1, role: 'ADMIN' },
      } as unknown as Request
      const res = createMockResponse()

      await invoke(listFeedback, req, res, noopNext())

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ id: 1 })]),
          meta: expect.objectContaining({ total: 1 }),
        }),
      )
    })
  })

  describe('createFeedback', () => {
    it('creates feedback and returns 201', async () => {
      mockedPrisma.feedback.findFirst.mockResolvedValue(null)
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

    it('returns 409 when user already submitted feedback', async () => {
      mockedPrisma.feedback.findFirst.mockResolvedValue({ id: 99 } as never)

      const req = {
        body: { category: 'BUG', title: 'Outro feedback', body: 'Texto suficiente para validar' },
        user: { userId: 1, role: 'OWNER' },
        ip: '127.0.0.1',
      } as unknown as Request
      const res = createMockResponse()
      const next = vi.fn()

      await invoke(createFeedback, req, res, next as unknown as NextFunction)

      expect(next).toHaveBeenCalledWith(expect.any(AppError))
      const err = (next as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0] as AppError
      expect(err.statusCode).toBe(409)
      expect(err.code).toBe('FEEDBACK_ALREADY_SUBMITTED')
    })
  })

  describe('getMyFeedback', () => {
    it('returns null data when user has no feedback', async () => {
      mockedPrisma.feedback.findFirst.mockResolvedValue(null)

      const req = { user: { userId: 1, role: 'OWNER' } } as unknown as Request
      const res = createMockResponse()

      await invoke(getMyFeedback, req, res, noopNext())

      expect(res.json).toHaveBeenCalledWith({ data: null })
    })

    it('returns the user feedback when it exists', async () => {
      const mockFeedback = {
        id: 7,
        userId: 1,
        category: 'BUG',
        title: 'Titulo',
        body: 'Corpo suficiente',
        votes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 1, firstName: 'João', lastName: 'Silva', avatarUrl: null },
      }
      mockedPrisma.feedback.findFirst.mockResolvedValue(mockFeedback as never)

      const req = { user: { userId: 1, role: 'OWNER' } } as unknown as Request
      const res = createMockResponse()

      await invoke(getMyFeedback, req, res, noopNext())

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: 7 }) }),
      )
    })
  })

  describe('exportFeedback', () => {
    it('sends markdown with headers', async () => {
      mockedPrisma.feedback.findMany.mockResolvedValue([] as never)

      const req = {} as unknown as Request
      const res = createMockResponse()

      await invoke(exportFeedback, req, res, noopNext())

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/markdown; charset=utf-8')
      expect(res.send).toHaveBeenCalled()
      const body = (res.send as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0] as string
      expect(body).toContain('_Sem feedback registado._')
    })
  })
})
