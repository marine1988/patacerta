import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import { recomputeServiceRating } from '../../lib/service-rating.js'
import {
  checkReviewEligibility,
  isReviewEligibilityBypassed,
  bypassedEligibility,
} from '../../lib/review-eligibility.js'
import type {
  CreateServiceReviewInput,
  ListServiceReviewsInput,
  UpdateServiceReviewInput,
  ModerateServiceReviewInput,
  FlagServiceReviewInput,
  ReplyToServiceReviewInput,
} from '@patacerta/shared'
import { Prisma } from '@prisma/client'

const FLAG_AUTO_HIDE_THRESHOLD = 3

const SERVICE_REVIEW_SELECT = {
  id: true,
  serviceId: true,
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
  service: { select: { id: true, title: true, providerId: true } },
  _count: { select: { flags: true } },
} satisfies Prisma.ServiceReviewSelect

export const listServiceReviews = asyncHandler(async (req, res) => {
  const { serviceId, authorId, status, page, limit, sort } =
    req.query as unknown as ListServiceReviewsInput
  const requester = req.user

  const where: Prisma.ServiceReviewWhereInput = {}

  // Non-admins can only see PUBLISHED reviews.
  if (requester?.role === 'ADMIN') {
    if (status) where.status = status
  } else {
    where.status = 'PUBLISHED'
  }

  if (serviceId) where.serviceId = serviceId
  if (authorId) where.authorId = authorId

  let orderBy: Prisma.ServiceReviewOrderByWithRelationInput
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
    prisma.serviceReview.findMany({
      where,
      select: SERVICE_REVIEW_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
    }),
    prisma.serviceReview.count({ where }),
  ])

  let summary: {
    avgRating: number | null
    totalReviews: number
    distribution: Record<1 | 2 | 3 | 4 | 5, number>
  } | null = null
  if (serviceId) {
    const [agg, groups] = await Promise.all([
      prisma.serviceReview.aggregate({
        where: { serviceId, status: 'PUBLISHED' },
        _avg: { rating: true },
        _count: { id: true },
      }),
      prisma.serviceReview.groupBy({
        by: ['rating'],
        where: { serviceId, status: 'PUBLISHED' },
        _count: { rating: true },
      }),
    ])
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const g of groups) {
      const r = g.rating as 1 | 2 | 3 | 4 | 5
      distribution[r] = g._count.rating
    }
    summary = {
      avgRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
      totalReviews: agg._count.id,
      distribution,
    }
  }

  res.json({ ...paginatedResponse(reviews, total, page, limit), summary })
})

export const getServiceReviewById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const requester = req.user

  const review = await prisma.serviceReview.findUnique({
    where: { id },
    select: SERVICE_REVIEW_SELECT,
  })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  // Only author, service provider, and admins can see non-PUBLISHED reviews
  if (review.status !== 'PUBLISHED') {
    const isAuthor = requester?.userId === review.authorId
    const isAdmin = requester?.role === 'ADMIN'
    const isProvider = requester?.userId === review.service.providerId
    if (!isAuthor && !isAdmin && !isProvider) {
      throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
    }
  }

  res.json(review)
})

export const createServiceReview = asyncHandler(async (req, res) => {
  const data = req.body as CreateServiceReviewInput
  const authorId = req.user!.userId

  const service = await prisma.service.findUnique({ where: { id: data.serviceId } })
  if (!service) throw new AppError(404, 'Serviço não encontrado', 'SERVICE_NOT_FOUND')
  if (service.providerId === authorId)
    throw new AppError(400, 'Não pode avaliar o seu próprio serviço', 'SELF_REVIEW')
  if (service.status !== 'ACTIVE')
    throw new AppError(400, 'Só pode avaliar serviços activos', 'SERVICE_NOT_ACTIVE')

  // Anti-fraude: requerer interação real (admins ignoram).
  if (req.user!.role !== 'ADMIN') {
    const elig = await checkReviewEligibility(authorId, {
      kind: 'service',
      serviceId: service.id,
      counterpartyUserId: service.providerId,
    })
    if (!elig.eligible) {
      throw new AppError(
        403,
        elig.reason ?? 'Sem permissão para avaliar este serviço',
        'INTERACTION_REQUIRED',
      )
    }
  }

  let review
  try {
    review = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceReview.create({
        data: {
          serviceId: data.serviceId,
          authorId,
          rating: data.rating,
          title: data.title,
          body: data.body,
        },
        select: SERVICE_REVIEW_SELECT,
      })
      await recomputeServiceRating(data.serviceId, tx)
      return created
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Já avaliou este serviço', 'REVIEW_EXISTS')
    }
    throw err
  }

  await logAudit({
    userId: authorId,
    action: 'SERVICE_REVIEW_CREATED',
    entity: 'service_review',
    entityId: review.id,
    details: `Serviço: ${service.title} | Estrelas: ${data.rating}`,
    ipAddress: req.ip,
  })

  res.status(201).json(review)
})

export const updateServiceReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.serviceReview.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.authorId !== req.user!.userId) throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  if (review.status !== 'PUBLISHED')
    throw new AppError(400, 'Não é possível editar uma avaliação moderada', 'REVIEW_MODERATED')

  const body = req.body as UpdateServiceReviewInput
  const updateData: Prisma.ServiceReviewUpdateInput = {}
  if (body.rating !== undefined) updateData.rating = body.rating
  if (body.title !== undefined) updateData.title = body.title
  if (body.body !== undefined) updateData.body = body.body

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.serviceReview.update({
      where: { id },
      data: updateData,
      select: SERVICE_REVIEW_SELECT,
    })
    if (body.rating !== undefined) {
      await recomputeServiceRating(review.serviceId, tx)
    }
    return u
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REVIEW_UPDATED',
    entity: 'service_review',
    entityId: id,
    details: JSON.stringify(updateData),
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const deleteServiceReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const review = await prisma.serviceReview.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  const isAdmin = req.user!.role === 'ADMIN'
  if (review.authorId !== req.user!.userId && !isAdmin) {
    throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceReview.delete({ where: { id } })
    await recomputeServiceRating(review.serviceId, tx)
  })

  await logAudit({
    userId: req.user!.userId,
    action:
      isAdmin && review.authorId !== req.user!.userId
        ? 'SERVICE_REVIEW_DELETED_BY_ADMIN'
        : 'SERVICE_REVIEW_DELETED',
    entity: 'service_review',
    entityId: id,
    details: `Serviço: ${review.serviceId} | Autor: ${review.authorId}`,
    ipAddress: req.ip,
  })

  res.status(204).send()
})

export const replyToServiceReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const body = req.body as ReplyToServiceReviewInput

  const review = await prisma.serviceReview.findUnique({
    where: { id },
    include: { service: true },
  })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.service.providerId !== req.user!.userId)
    throw new AppError(403, 'Só o prestador do serviço pode responder', 'FORBIDDEN')
  if (review.status !== 'PUBLISHED')
    throw new AppError(400, 'Não é possível responder a uma avaliação moderada', 'REVIEW_MODERATED')

  const updated = await prisma.serviceReview.update({
    where: { id },
    data: { reply: body.reply, repliedAt: new Date() },
    select: SERVICE_REVIEW_SELECT,
  })

  await logAudit({
    userId: req.user!.userId,
    action: review.reply ? 'SERVICE_REVIEW_REPLY_UPDATED' : 'SERVICE_REVIEW_REPLIED',
    entity: 'service_review',
    entityId: id,
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const moderateServiceReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const data = req.body as ModerateServiceReviewInput

  const review = await prisma.serviceReview.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.serviceReview.update({
      where: { id },
      data: {
        status: data.status,
        moderationReason: data.reason ?? null,
      },
      select: SERVICE_REVIEW_SELECT,
    })
    // Recompute if PUBLISHED status was added or removed
    if (
      (review.status === 'PUBLISHED' && data.status !== 'PUBLISHED') ||
      (review.status !== 'PUBLISHED' && data.status === 'PUBLISHED')
    ) {
      await recomputeServiceRating(review.serviceId, tx)
    }
    return u
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REVIEW_MODERATED',
    entity: 'service_review',
    entityId: id,
    details: `${review.status} -> ${data.status}${data.reason ? ` | Motivo: ${data.reason}` : ''}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const flagServiceReview = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const userId = req.user!.userId
  const { reason } = req.body as FlagServiceReviewInput

  const review = await prisma.serviceReview.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')
  if (review.authorId === userId)
    throw new AppError(400, 'Não pode denunciar a sua própria avaliação', 'SELF_FLAG')
  if (review.status !== 'PUBLISHED')
    throw new AppError(400, 'Só pode denunciar avaliações publicadas', 'REVIEW_NOT_PUBLISHED')

  // Record the flag (idempotent per (review, reporter) due to unique constraint)
  try {
    await prisma.serviceReviewFlag.create({
      data: { reviewId: id, reporterId: userId, reason },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Já denunciou esta avaliação', 'ALREADY_FLAGGED')
    }
    throw err
  }

  // Count flags and auto-hide if threshold reached
  const flagCount = await prisma.serviceReviewFlag.count({ where: { reviewId: id } })
  let updated
  if (flagCount >= FLAG_AUTO_HIDE_THRESHOLD && review.status === 'PUBLISHED') {
    updated = await prisma.$transaction(async (tx) => {
      const u = await tx.serviceReview.update({
        where: { id },
        data: { status: 'FLAGGED' },
        select: SERVICE_REVIEW_SELECT,
      })
      await recomputeServiceRating(review.serviceId, tx)
      return u
    })
    await logAudit({
      action: 'SERVICE_REVIEW_AUTO_FLAGGED',
      entity: 'service_review',
      entityId: id,
      details: `Denúncias: ${flagCount}`,
      ipAddress: req.ip,
    })
  } else {
    updated = await prisma.serviceReview.findUnique({
      where: { id },
      select: SERVICE_REVIEW_SELECT,
    })
  }

  await logAudit({
    userId,
    action: 'SERVICE_REVIEW_FLAGGED',
    entity: 'service_review',
    entityId: id,
    details: `Motivo: ${reason} | Total denúncias: ${flagCount}`,
    ipAddress: req.ip,
  })

  res.status(201).json({ review: updated, flagCount })
})

/**
 * GET /service-reviews/eligibility?serviceId=X
 * Devolve {eligible, reason, detail} para a UI desactivar o botão e
 * explicar a razão. Admins recebem sempre eligible:true.
 */
export const getServiceReviewEligibility = asyncHandler(async (req, res) => {
  const authorId = req.user!.userId
  const serviceId = parseId(String(req.query.serviceId ?? ''))

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

  const service = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!service) throw new AppError(404, 'Serviço não encontrado', 'SERVICE_NOT_FOUND')

  // Auto-avaliação: também não elegível, mas razão diferente.
  if (service.providerId === authorId) {
    res.json({
      eligible: false,
      reason: 'Não pode avaliar o seu próprio serviço.',
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

  if (service.status !== 'ACTIVE') {
    res.json({
      eligible: false,
      reason: 'Só pode avaliar serviços activos.',
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
    kind: 'service',
    serviceId: service.id,
    counterpartyUserId: service.providerId,
  })
  res.json(result)
})

export const listMyServiceReviews = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const { page = 1, limit = 20 } = req.query as unknown as { page?: number; limit?: number }

  const where: Prisma.ServiceReviewWhereInput = { authorId: userId }

  const [reviews, total] = await Promise.all([
    prisma.serviceReview.findMany({
      where,
      select: SERVICE_REVIEW_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.serviceReview.count({ where }),
  ])

  res.json(paginatedResponse(reviews, total, page, limit))
})

export const listServiceReviewsAboutMe = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const { page = 1, limit = 20 } = req.query as unknown as { page?: number; limit?: number }

  // All reviews on services where I am the provider
  const where: Prisma.ServiceReviewWhereInput = { service: { providerId: userId } }

  const [reviews, total] = await Promise.all([
    prisma.serviceReview.findMany({
      where,
      select: SERVICE_REVIEW_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.serviceReview.count({ where }),
  ])

  res.json(paginatedResponse(reviews, total, page, limit))
})

export const listServiceReviewFlags = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const flags = await prisma.serviceReviewFlag.findMany({
    where: { reviewId: id },
    include: { reporter: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ flags })
})

export const dismissServiceReviewFlags = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const review = await prisma.serviceReview.findUnique({ where: { id } })
  if (!review) throw new AppError(404, 'Avaliação não encontrada', 'REVIEW_NOT_FOUND')

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.serviceReviewFlag.deleteMany({ where: { reviewId: id } })

    // If the review was auto-FLAGGED and an admin dismisses the flags, restore to PUBLISHED
    if (review.status === 'FLAGGED') {
      await tx.serviceReview.update({
        where: { id },
        data: { status: 'PUBLISHED', moderationReason: null },
      })
      await recomputeServiceRating(review.serviceId, tx)
    }
    return count
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REVIEW_FLAGS_DISMISSED',
    entity: 'service_review',
    entityId: id,
    details: `Denúncias removidas: ${result}`,
    ipAddress: req.ip,
  })

  res.json({ dismissed: result })
})
