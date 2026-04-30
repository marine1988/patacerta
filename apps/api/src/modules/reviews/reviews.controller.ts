import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import { recomputeBreederRating } from '../../services/breeder-stats.js'
import {
  checkReviewEligibility,
  isReviewEligibilityBypassed,
  bypassedEligibility,
} from '../../lib/review-eligibility.js'
import type {
  CreateReviewInput,
  ListReviewsInput,
  UpdateReviewInput,
  ModerateReviewInput,
  FlagReviewInput,
  ReplyToReviewInput,
} from '@patacerta/shared'
import { Prisma } from '@prisma/client'

const FLAG_AUTO_HIDE_THRESHOLD = 3

const REVIEW_SELECT = {
  id: true,
  breederId: true,
  authorId: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  moderationReason: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  breeder: { select: { id: true, businessName: true } },
  _count: { select: { flags: true } },
} satisfies Prisma.ReviewSelect

export const listReviews = asyncHandler(async (req, res) => {
  const { breederId, authorId, status, page, limit, sort } =
    req.query as unknown as ListReviewsInput
  const requester = req.user

  const where: Prisma.ReviewWhereInput = {}

  // Non-admins can only see PUBLISHED reviews.
  if (requester?.role === 'ADMIN') {
    if (status) where.status = status
  } else {
    where.status = 'PUBLISHED'
  }

  if (breederId) where.breederId = breederId
  if (authorId) where.authorId = authorId

  let orderBy: Prisma.ReviewOrderByWithRelationInput
  switch (sort) {
    case 'highest':
      orderBy = { rating: 'desc' }
      break
    case 'lowest':
      orderBy = { rating: 'asc' }
      break
    case 'oldest':
      orderBy = { createdAt: 'asc' }
      break
    default:
      orderBy = { createdAt: 'desc' }
  }

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: REVIEW_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
    }),
    prisma.review.count({ where }),
  ])

  let summary: {
    avgRating: number | null
    totalReviews: number
    distribution: Record<1 | 2 | 3 | 4 | 5, number>
  } | null = null
  if (breederId) {
    // Uma única query: groupBy por rating já contém todos os dados necessários
    // (total = soma counts; avg = soma(rating*count)/total). Elimina o aggregate
    // duplicado e corta um round-trip à BD.
    const groups = await prisma.review.groupBy({
      by: ['rating'],
      where: { breederId, status: 'PUBLISHED' },
      _count: { rating: true },
    })
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let totalReviews = 0
    let sumRating = 0
    for (const g of groups) {
      const r = g.rating as 1 | 2 | 3 | 4 | 5
      const c = g._count.rating
      distribution[r] = c
      totalReviews += c
      sumRating += r * c
    }
    summary = {
      avgRating: totalReviews > 0 ? Math.round((sumRating / totalReviews) * 10) / 10 : null,
      totalReviews,
      distribution,
    }
  }

  res.json({ ...paginatedResponse(reviews, total, page, limit), summary })
})

export const getReviewById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const requester = req.user

  const review = await prisma.review.findUnique({ where: { id }, select: REVIEW_SELECT })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  // Only author, reviewed breeder, and admins can see non-PUBLISHED reviews
  if (review.status !== 'PUBLISHED') {
    const isAuthor = requester?.userId === review.authorId
    const isAdmin = requester?.role === 'ADMIN'
    let isReviewedBreeder = false
    if (requester?.role === 'BREEDER') {
      const b = await prisma.breeder.findUnique({ where: { userId: requester.userId } })
      isReviewedBreeder = b?.id === review.breederId
    }
    if (!isAuthor && !isAdmin && !isReviewedBreeder) {
      throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
    }
  }

  res.json(review)
})

export const createReview = asyncHandler(async (req, res) => {
  const data = req.body as CreateReviewInput
  const authorId = req.user!.userId

  const breeder = await prisma.breeder.findUnique({ where: { id: data.breederId } })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.userId === authorId)
    throw new AppError(400, 'Não pode avaliar o seu próprio perfil', 'SELF_REVIEW')
  if (breeder.status !== 'VERIFIED')
    throw new AppError(400, 'Só pode avaliar criadores verificados', 'NOT_VERIFIED')

  // Anti-fraude: requerer interação real (admins ignoram).
  if (req.user!.role !== 'ADMIN') {
    const elig = await checkReviewEligibility(authorId, {
      kind: 'breeder',
      breederId: breeder.id,
      counterpartyUserId: breeder.userId,
    })
    if (!elig.eligible) {
      throw new AppError(
        403,
        elig.reason ?? 'Sem permissão para avaliar este criador',
        'INTERACTION_REQUIRED',
      )
    }
  }

  let review
  try {
    review = await prisma.review.create({
      data: {
        breederId: data.breederId,
        authorId,
        rating: data.rating,
        title: data.title,
        body: data.body,
      },
      select: REVIEW_SELECT,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Já avaliou este criador', 'REVIEW_EXISTS')
    }
    throw err
  }

  await logAudit({
    userId: authorId,
    action: 'REVIEW_CREATED',
    entity: 'review',
    entityId: review.id,
    details: `Criador: ${breeder.businessName} | Estrelas: ${data.rating}`,
    ipAddress: req.ip,
  })

  await recomputeBreederRating(data.breederId)

  res.status(201).json(review)
})

export const updateReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.authorId !== req.user!.userId) throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  if (review.status !== 'PUBLISHED')
    throw new AppError(400, 'Não é possível editar uma avaliação moderada', 'REVIEW_MODERATED')

  const body = req.body as UpdateReviewInput
  const updateData: Prisma.ReviewUpdateInput = {}
  if (body.rating !== undefined) updateData.rating = body.rating
  if (body.title !== undefined) updateData.title = body.title
  if (body.body !== undefined) updateData.body = body.body

  const updated = await prisma.review.update({
    where: { id },
    data: updateData,
    select: REVIEW_SELECT,
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'REVIEW_UPDATED',
    entity: 'review',
    entityId: id,
    details: JSON.stringify(updateData),
    ipAddress: req.ip,
  })

  // O rating pode ter mudado — recalcula agregados.
  if (body.rating !== undefined) await recomputeBreederRating(review.breederId)

  res.json(updated)
})

export const deleteReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  const isAdmin = req.user!.role === 'ADMIN'
  if (review.authorId !== req.user!.userId && !isAdmin) {
    throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  }

  await prisma.review.delete({ where: { id } })

  await logAudit({
    userId: req.user!.userId,
    action:
      isAdmin && review.authorId !== req.user!.userId
        ? 'REVIEW_DELETED_BY_ADMIN'
        : 'REVIEW_DELETED',
    entity: 'review',
    entityId: id,
    details: `Criador: ${review.breederId} | Autor: ${review.authorId}`,
    ipAddress: req.ip,
  })

  await recomputeBreederRating(review.breederId)

  res.status(204).send()
})

export const replyToReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const body = req.body as ReplyToReviewInput

  const review = await prisma.review.findUnique({ where: { id }, include: { breeder: true } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.breeder.userId !== req.user!.userId)
    throw new AppError(403, 'Só o criador avaliado pode responder', 'FORBIDDEN')
  if (review.status !== 'PUBLISHED')
    throw new AppError(400, 'Não é possível responder a uma avaliação moderada', 'REVIEW_MODERATED')

  const updated = await prisma.review.update({
    where: { id },
    data: { reply: body.reply, repliedAt: new Date() },
    select: REVIEW_SELECT,
  })

  await logAudit({
    userId: req.user!.userId,
    action: review.reply ? 'REVIEW_REPLY_UPDATED' : 'REVIEW_REPLIED',
    entity: 'review',
    entityId: id,
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const moderateReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const data = req.body as ModerateReviewInput

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  const updated = await prisma.review.update({
    where: { id },
    data: {
      status: data.status,
      moderationReason: data.reason ?? null,
    },
    select: REVIEW_SELECT,
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'REVIEW_MODERATED',
    entity: 'review',
    entityId: id,
    details: `${review.status} -> ${data.status}${data.reason ? ` | Motivo: ${data.reason}` : ''}`,
    ipAddress: req.ip,
  })

  // Status pode entrar/sair de PUBLISHED — recalcula agregados.
  if (review.status !== data.status) await recomputeBreederRating(review.breederId)

  res.json(updated)
})

export const flagReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const userId = req.user!.userId
  const { reason } = req.body as FlagReviewInput

  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.authorId === userId)
    throw new AppError(400, 'Não pode denunciar a sua própria avaliação', 'SELF_FLAG')
  if (review.status !== 'PUBLISHED')
    throw new AppError(400, 'Só pode denunciar avaliações publicadas', 'REVIEW_NOT_PUBLISHED')

  // Record the flag (idempotent per (review, reporter) due to unique constraint)
  try {
    await prisma.reviewFlag.create({ data: { reviewId: id, reporterId: userId, reason } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Já denunciou esta avaliação', 'ALREADY_FLAGGED')
    }
    throw err
  }

  // Count flags and auto-hide if threshold reached
  const flagCount = await prisma.reviewFlag.count({ where: { reviewId: id } })
  let updated
  if (flagCount >= FLAG_AUTO_HIDE_THRESHOLD && review.status === 'PUBLISHED') {
    updated = await prisma.review.update({
      where: { id },
      data: { status: 'FLAGGED' },
      select: REVIEW_SELECT,
    })
    await logAudit({
      action: 'REVIEW_AUTO_FLAGGED',
      entity: 'review',
      entityId: id,
      details: `Denúncias: ${flagCount}`,
      ipAddress: req.ip,
    })
    // Saiu de PUBLISHED — recalcula agregados.
    await recomputeBreederRating(review.breederId)
  } else {
    updated = await prisma.review.findUnique({ where: { id }, select: REVIEW_SELECT })
  }

  await logAudit({
    userId,
    action: 'REVIEW_FLAGGED',
    entity: 'review',
    entityId: id,
    details: `Motivo: ${reason} | Total denúncias: ${flagCount}`,
    ipAddress: req.ip,
  })

  res.status(201).json({ review: updated, flagCount })
})

/**
 * GET /reviews/eligibility?breederId=X
 * Devolve {eligible, reason, detail} para a UI desactivar o botão e
 * explicar a razão. Admins recebem sempre eligible:true.
 */
export const getReviewEligibility = asyncHandler(async (req, res) => {
  const authorId = req.user!.userId
  const breederId = parseId(String(req.query.breederId ?? ''))

  if (req.user!.role === 'ADMIN' || isReviewEligibilityBypassed()) {
    res.json(
      req.user!.role === 'ADMIN'
        ? {
            eligible: true,
            reason: null,
            detail: {
              threadFound: true,
              sentByAuthor: 0,
              sentByCounterparty: 0,
              windowDays: 30,
              minPerSide: 2,
            },
          }
        : bypassedEligibility(),
    )
    return
  }

  const breeder = await prisma.breeder.findUnique({ where: { id: breederId } })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')

  // Auto-avaliação: também não elegível, mas razão diferente.
  if (breeder.userId === authorId) {
    res.json({
      eligible: false,
      reason: 'Não pode avaliar o seu próprio perfil.',
      detail: {
        threadFound: false,
        sentByAuthor: 0,
        sentByCounterparty: 0,
        windowDays: 30,
        minPerSide: 2,
      },
    })
    return
  }

  const result = await checkReviewEligibility(authorId, {
    kind: 'breeder',
    breederId: breeder.id,
    counterpartyUserId: breeder.userId,
  })
  res.json(result)
})

export const listMyReviews = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const { page = 1, limit = 20 } = req.query as unknown as { page?: number; limit?: number }

  const where: Prisma.ReviewWhereInput = { authorId: userId }

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: REVIEW_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.review.count({ where }),
  ])

  res.json(paginatedResponse(reviews, total, page, limit))
})

export const listReviewsAboutMe = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const breeder = await prisma.breeder.findUnique({ where: { userId } })
  if (!breeder) throw new AppError(404, 'Perfil de criador não encontrado', 'BREEDER_NOT_FOUND')

  const { page = 1, limit = 20 } = req.query as unknown as { page?: number; limit?: number }

  const where: Prisma.ReviewWhereInput = { breederId: breeder.id }

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: REVIEW_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.review.count({ where }),
  ])

  res.json(paginatedResponse(reviews, total, page, limit))
})

export const listReviewFlags = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const flags = await prisma.reviewFlag.findMany({
    where: { reviewId: id },
    include: { reporter: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ flags })
})

export const dismissReviewFlags = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  const { count } = await prisma.reviewFlag.deleteMany({ where: { reviewId: id } })

  // If the review was auto-FLAGGED and an admin dismisses the flags, restore to PUBLISHED
  let restored = false
  if (review.status === 'FLAGGED') {
    await prisma.review.update({
      where: { id },
      data: { status: 'PUBLISHED', moderationReason: null },
    })
    restored = true
  }

  await logAudit({
    userId: req.user!.userId,
    action: 'REVIEW_FLAGS_DISMISSED',
    entity: 'review',
    entityId: id,
    details: `Denúncias removidas: ${count}`,
    ipAddress: req.ip,
  })

  // Voltou a PUBLISHED — recalcula agregados.
  if (restored) await recomputeBreederRating(review.breederId)

  res.json({ dismissed: count })
})
