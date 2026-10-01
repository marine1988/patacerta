import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import type { CreateFeedbackInput, ListFeedbackInput } from '@patacerta/shared'
import { Prisma } from '@prisma/client'

const FEEDBACK_SELECT = {
  id: true,
  userId: true,
  category: true,
  title: true,
  body: true,
  votes: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} satisfies Prisma.FeedbackSelect

export const listFeedback = asyncHandler(async (req, res) => {
  const { category, page, limit, sort } = req.query as unknown as ListFeedbackInput

  const where: Prisma.FeedbackWhereInput = {}
  if (category) where.category = category

  const orderBy: Prisma.FeedbackOrderByWithRelationInput =
    sort === 'recent' ? { createdAt: 'desc' } : { votes: 'desc' }

  const [feedback, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      select: FEEDBACK_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
    }),
    prisma.feedback.count({ where }),
  ])

  // Check which items the current user has voted on
  let votedIds: Set<number> = new Set()
  if (req.user) {
    const votes = await prisma.feedbackVote.findMany({
      where: {
        userId: req.user.userId,
        feedbackId: { in: feedback.map((f) => f.id) },
      },
      select: { feedbackId: true },
    })
    votedIds = new Set(votes.map((v) => v.feedbackId))
  }

  const data = feedback.map((f) => ({
    ...f,
    hasVoted: votedIds.has(f.id),
  }))

  res.json(paginatedResponse(data, total, page, limit))
})

export const createFeedback = asyncHandler(async (req, res) => {
  const data = req.body as CreateFeedbackInput
  const userId = req.user!.userId

  const created = await prisma.feedback.create({
    data: {
      userId,
      category: data.category,
      title: data.title,
      body: data.body,
    },
    select: FEEDBACK_SELECT,
  })

  await logAudit({
    userId,
    action: 'FEEDBACK_CREATED',
    entity: 'feedback',
    entityId: created.id,
    details: `Categoria: ${data.category} | Título: ${data.title}`,
    ipAddress: req.ip,
  })

  res.status(201).json({ ...created, hasVoted: false })
})

export const voteFeedback = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const userId = req.user!.userId

  const feedback = await prisma.feedback.findUnique({ where: { id } })
  if (!feedback) throw new AppError(404, 'Feedback não encontrado', 'FEEDBACK_NOT_FOUND')
  if (feedback.userId === userId)
    throw new AppError(400, 'Não pode votar no seu próprio feedback', 'SELF_VOTE')

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.feedbackVote.create({ data: { feedbackId: id, userId } })
      const updated = await tx.feedback.update({
        where: { id },
        data: { votes: { increment: 1 } },
        select: FEEDBACK_SELECT,
      })
      return updated
    })

    await logAudit({
      userId,
      action: 'FEEDBACK_VOTED',
      entity: 'feedback',
      entityId: id,
      ipAddress: req.ip,
    })

    res.json({ ...result, hasVoted: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Já votou neste feedback', 'ALREADY_VOTED')
    }
    throw err
  }
})

export const unvoteFeedback = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const userId = req.user!.userId

  const feedback = await prisma.feedback.findUnique({ where: { id } })
  if (!feedback) throw new AppError(404, 'Feedback não encontrado', 'FEEDBACK_NOT_FOUND')

  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.feedbackVote.deleteMany({
      where: { feedbackId: id, userId },
    })
    if (deleted.count === 0) return null
    const updated = await tx.feedback.update({
      where: { id },
      data: { votes: { decrement: 1 } },
      select: FEEDBACK_SELECT,
    })
    return updated
  })

  if (!result) throw new AppError(400, 'Não votou neste feedback', 'NOT_VOTED')

  await logAudit({
    userId,
    action: 'FEEDBACK_UNVOTED',
    entity: 'feedback',
    entityId: id,
    ipAddress: req.ip,
  })

  res.json({ ...result, hasVoted: false })
})
