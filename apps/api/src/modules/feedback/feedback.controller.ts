import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import type { CreateFeedbackInput, ListFeedbackInput } from '@patacerta/shared'
import { Prisma } from '@prisma/client'
import { buildFeedbackMarkdown } from './feedback.markdown.js'
import type { FeedbackMarkdownItem } from './feedback.markdown.js'

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
  const { category, page, limit } = req.query as unknown as ListFeedbackInput

  const where: Prisma.FeedbackWhereInput = {}
  if (category) where.category = category

  const [feedback, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      select: FEEDBACK_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.feedback.count({ where }),
  ])

  res.json(paginatedResponse(feedback, total, page, limit))
})

export const getMyFeedback = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const limit = 5
  const items = await prisma.feedback.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: FEEDBACK_SELECT,
  })
  res.json({ data: items, limit, remaining: Math.max(0, limit - items.length) })
})

export const createFeedback = asyncHandler(async (req, res) => {
  const data = req.body as CreateFeedbackInput
  const userId = req.user!.userId

  const count = await prisma.feedback.count({ where: { userId } })
  if (count >= 5) {
    throw new AppError(409, 'Atingiu o limite de 5 feedbacks. Obrigado!', 'FEEDBACK_LIMIT_REACHED')
  }

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

export const exportFeedback = asyncHandler(async (_req, res) => {
  const feedback = await prisma.feedback.findMany({
    select: {
      id: true,
      userId: true,
      category: true,
      title: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
  })

  const items: FeedbackMarkdownItem[] = feedback.map((f) => ({
    id: f.id,
    userId: f.userId,
    category: f.category,
    title: f.title,
    body: f.body,
    createdAt: f.createdAt,
    user: f.user,
  }))

  const md = buildFeedbackMarkdown(items, new Date())

  const dateStr = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="patacerta-feedback-${dateStr}.md"`)
  res.send(md)
})
