import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import type { CreateReviewInput, ListReviewsInput, UpdateReviewInput } from '@patacerta/shared'
import { Prisma } from '@prisma/client'

const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  breeder: { select: { id: true, businessName: true } },
}

export const listReviews = asyncHandler(async (req, res) => {
  const { breederId, page, limit, sort } = req.query as unknown as ListReviewsInput

  const where: Prisma.ReviewWhereInput = { status: 'PUBLISHED' }
  if (breederId) where.breederId = breederId

  let orderBy: Prisma.ReviewOrderByWithRelationInput
  switch (sort) {
    case 'highest':
      orderBy = { rating: 'desc' }
      break
    case 'lowest':
      orderBy = { rating: 'asc' }
      break
    default:
      orderBy = { createdAt: 'desc' }
  }

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({ where, select: REVIEW_SELECT, skip: (page - 1) * limit, take: limit, orderBy }),
    prisma.review.count({ where }),
  ])

  let summary = null
  if (breederId) {
    const agg = await prisma.review.aggregate({
      where: { breederId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { id: true },
    })
    summary = {
      avgRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
      totalReviews: agg._count.id,
    }
  }

  res.json({ ...paginatedResponse(reviews, total, page, limit), summary })
})

export const getReviewById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.review.findUnique({ where: { id }, select: REVIEW_SELECT })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.status !== 'PUBLISHED') throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  res.json(review)
})

export const createReview = asyncHandler(async (req, res) => {
  const data = req.body as CreateReviewInput
  const authorId = req.user!.userId

  const breeder = await prisma.breeder.findUnique({ where: { id: data.breederId } })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.userId === authorId) throw new AppError(400, 'Não pode avaliar o seu próprio perfil', 'SELF_REVIEW')
  if (breeder.status !== 'VERIFIED') throw new AppError(400, 'Só pode avaliar criadores verificados', 'NOT_VERIFIED')

  let review
  try {
    review = await prisma.review.create({
      data: { breederId: data.breederId, authorId, rating: data.rating, title: data.title, body: data.body },
      select: REVIEW_SELECT,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Já avaliou este criador', 'REVIEW_EXISTS')
    }
    throw err
  }

  res.status(201).json(review)
})

export const updateReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.authorId !== req.user!.userId) throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  if (review.status !== 'PUBLISHED') throw new AppError(400, 'Não é possível editar uma avaliação moderada', 'REVIEW_MODERATED')

  const body = req.body as UpdateReviewInput
  const updateData: Prisma.ReviewUpdateInput = {}
  if (body.rating !== undefined) updateData.rating = body.rating
  if (body.title !== undefined) updateData.title = body.title
  if (body.body !== undefined) updateData.body = body.body

  const updated = await prisma.review.update({ where: { id }, data: updateData, select: REVIEW_SELECT })
  res.json(updated)
})

export const deleteReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.authorId !== req.user!.userId && req.user!.role !== 'ADMIN') {
    throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  }

  await prisma.review.delete({ where: { id } })
  res.status(204).send()
})

export const replyToReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.review.findUnique({ where: { id }, include: { breeder: true } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.breeder.userId !== req.user!.userId) throw new AppError(403, 'Só o criador avaliado pode responder', 'FORBIDDEN')

  const updated = await prisma.review.update({
    where: { id },
    data: { reply: req.body.reply, repliedAt: new Date() },
    select: REVIEW_SELECT,
  })
  res.json(updated)
})

export const moderateReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  const updated = await prisma.review.update({
    where: { id },
    data: { status: req.body.status },
    select: REVIEW_SELECT,
  })
  res.json(updated)
})

export const flagReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const userId = req.user!.userId

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.authorId === userId) throw new AppError(400, 'Não pode denunciar a sua própria avaliação', 'SELF_FLAG')
  if (review.status === 'FLAGGED') throw new AppError(400, 'Avaliação já foi denunciada', 'ALREADY_FLAGGED')
  if (review.status !== 'PUBLISHED') throw new AppError(400, 'Só pode denunciar avaliações publicadas', 'REVIEW_NOT_PUBLISHED')

  const reason = req.body.reason as string | undefined

  const updated = await prisma.review.update({
    where: { id },
    data: { status: 'FLAGGED' },
    select: REVIEW_SELECT,
  })

  // Fire-and-forget audit entry
  prisma.auditLog.create({
    data: {
      userId,
      action: 'REVIEW_FLAGGED',
      entity: 'review',
      entityId: id,
      details: reason ? `Motivo: ${reason}` : 'Sem motivo fornecido',
      ipAddress: req.ip,
    },
  }).catch(() => {})

  res.json(updated)
})
