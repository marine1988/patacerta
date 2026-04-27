import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, parsePagination, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import type {
  ResolveReportInput,
  ResolveServiceReportInput,
  SuspendServiceInput,
} from '@patacerta/shared'

export const getPendingCounts = asyncHandler(async (_req, res) => {
  const [
    pendingDocs,
    pendingBreeders,
    flaggedReviews,
    flaggedServiceReviews,
    pendingMessageReports,
    pendingServiceReports,
  ] = await Promise.all([
    prisma.verificationDoc.count({ where: { status: 'PENDING' } }),
    prisma.breeder.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.review.count({ where: { status: 'FLAGGED' } }),
    prisma.serviceReview.count({ where: { status: 'FLAGGED' } }),
    prisma.messageReport.count({ where: { status: 'PENDING' } }),
    prisma.serviceReport.count({ where: { status: 'PENDING' } }),
  ])

  res.json({
    pendingDocs,
    pendingBreeders,
    flaggedReviews: flaggedReviews + flaggedServiceReviews,
    flaggedBreederReviews: flaggedReviews,
    flaggedServiceReviews,
    pendingMessageReports,
    pendingServiceReports,
    total:
      pendingDocs +
      pendingBreeders +
      flaggedReviews +
      flaggedServiceReviews +
      pendingMessageReports +
      pendingServiceReports,
  })
})

export const getDashboardStats = asyncHandler(async (_req, res) => {
  const [
    totalUsers,
    totalBreeders,
    verifiedBreeders,
    pendingVerifications,
    totalReviews,
    flaggedReviews,
    totalServiceReviews,
    flaggedServiceReviews,
    totalMessages,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.breeder.count(),
    prisma.breeder.count({ where: { status: 'VERIFIED' } }),
    prisma.verificationDoc.count({ where: { status: 'PENDING' } }),
    prisma.review.count(),
    prisma.review.count({ where: { status: 'FLAGGED' } }),
    prisma.serviceReview.count(),
    prisma.serviceReview.count({ where: { status: 'FLAGGED' } }),
    prisma.message.count(),
  ])

  res.json({
    users: { total: totalUsers },
    breeders: { total: totalBreeders, verified: verifiedBreeders },
    verifications: { pending: pendingVerifications },
    reviews: {
      total: totalReviews + totalServiceReviews,
      flagged: flaggedReviews + flaggedServiceReviews,
      breeder: { total: totalReviews, flagged: flaggedReviews },
      service: { total: totalServiceReviews, flagged: flaggedServiceReviews },
    },
    messages: { total: totalMessages },
  })
})

export const getPendingVerifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const where = { status: 'PENDING' as const }

  const [docs, total] = await Promise.all([
    prisma.verificationDoc.findMany({
      where,
      include: {
        breeder: {
          select: {
            id: true,
            businessName: true,
            nif: true,
            status: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.verificationDoc.count({ where }),
  ])

  res.json(paginatedResponse(docs, total, page, limit))
})

export const listAllUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const role = req.query.role as string | undefined

  const where: Record<string, unknown> = {}
  if (role) where.role = role

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        breeder: { select: { id: true, status: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ])

  res.json(paginatedResponse(users, total, page, limit))
})

export const suspendUser = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (id === req.user!.userId)
    throw new AppError(400, 'Não pode suspender a sua própria conta', 'SELF_SUSPEND')

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')
  if (!user.isActive) throw new AppError(400, 'Utilizador já está suspenso', 'ALREADY_SUSPENDED')

  // Deactivate user account
  await prisma.user.update({ where: { id }, data: { isActive: false, suspendedAt: new Date() } })

  if (user.role === 'BREEDER') {
    await prisma.breeder.updateMany({ where: { userId: id }, data: { status: 'SUSPENDED' } })
  }

  // Q5: Use logAudit utility instead of raw prisma call
  await logAudit({
    userId: req.user!.userId,
    action: 'SUSPEND_USER',
    entity: 'User',
    entityId: id,
    details: `Suspended user ${user.email}`,
    ipAddress: req.ip,
  })

  res.status(204).send()
})

export const listAllBreeders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const status = req.query.status as string | undefined

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const [breeders, total] = await Promise.all([
    prisma.breeder.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        district: { select: { namePt: true } },
        _count: { select: { verificationDocs: true, reviews: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.breeder.count({ where }),
  ])

  res.json(paginatedResponse(breeders, total, page, limit))
})

export const changeBreederStatus = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const { status } = req.body
  if (!['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED'].includes(status)) {
    throw new AppError(400, 'Estado inválido', 'INVALID_STATUS')
  }

  const breeder = await prisma.breeder.findUnique({ where: { id } })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')

  const updated = await prisma.breeder.update({
    where: { id },
    data: { status },
    select: { id: true, businessName: true, status: true },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'CHANGE_BREEDER_STATUS',
    entity: 'Breeder',
    entityId: id,
    details: `Changed status to ${status}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const getFlaggedReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const type = (req.query.type as string | undefined) ?? 'breeder'
  if (!['breeder', 'service', 'all'].includes(type)) {
    throw new AppError(400, 'Tipo inválido', 'INVALID_TYPE')
  }
  const where = { status: 'FLAGGED' as const }

  if (type === 'breeder') {
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          status: true,
          createdAt: true,
          author: { select: { id: true, firstName: true, lastName: true, email: true } },
          breeder: { select: { id: true, businessName: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.review.count({ where }),
    ])
    const items = reviews.map((r) => ({ ...r, type: 'breeder' as const }))
    res.json(paginatedResponse(items, total, page, limit))
    return
  }

  if (type === 'service') {
    const [reviews, total] = await Promise.all([
      prisma.serviceReview.findMany({
        where,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          status: true,
          createdAt: true,
          author: { select: { id: true, firstName: true, lastName: true, email: true } },
          service: { select: { id: true, title: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.serviceReview.count({ where }),
    ])
    const items = reviews.map((r) => ({ ...r, type: 'service' as const }))
    res.json(paginatedResponse(items, total, page, limit))
    return
  }

  // type === 'all' — merge both, sorted by createdAt desc
  const [breederReviews, breederTotal, serviceReviews, serviceTotal] = await Promise.all([
    prisma.review.findMany({
      where,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        status: true,
        createdAt: true,
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        breeder: { select: { id: true, businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.review.count({ where }),
    prisma.serviceReview.findMany({
      where,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        status: true,
        createdAt: true,
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        service: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.serviceReview.count({ where }),
  ])

  const merged = [
    ...breederReviews.map((r) => ({ ...r, type: 'breeder' as const })),
    ...serviceReviews.map((r) => ({ ...r, type: 'service' as const })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const total = breederTotal + serviceTotal
  const paged = merged.slice(skip, skip + limit)
  res.json(paginatedResponse(paged, total, page, limit))
})

export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const action = req.query.action as string | undefined
  const entity = req.query.entity as string | undefined
  const userId = req.query.userId ? Number(req.query.userId) : undefined

  const where: Record<string, unknown> = {}
  if (action) where.action = action
  if (entity) where.entity = entity
  if (userId && !isNaN(userId)) where.userId = userId

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ])

  res.json(paginatedResponse(logs, total, page, limit))
})

// ──────────────────────────────────────────────────────────────────────
// Message reports moderation
// ──────────────────────────────────────────────────────────────────────

export const listMessageReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const status = (req.query.status as string | undefined) ?? 'PENDING'
  if (!['PENDING', 'RESOLVED', 'DISMISSED'].includes(status)) {
    throw new AppError(400, 'Estado inválido', 'INVALID_STATUS')
  }

  const where = { status: status as 'PENDING' | 'RESOLVED' | 'DISMISSED' }

  const [reports, total] = await Promise.all([
    prisma.messageReport.findMany({
      where,
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
        message: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            editedAt: true,
            deletedAt: true,
            senderId: true,
            threadId: true,
            sender: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
      skip,
      take: limit,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.messageReport.count({ where }),
  ])

  res.json(paginatedResponse(reports, total, page, limit))
})

export const getMessageReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const report = await prisma.messageReport.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
      reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      message: {
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
          thread: {
            include: {
              owner: { select: { id: true, firstName: true, lastName: true, email: true } },
              breeder: {
                select: {
                  id: true,
                  businessName: true,
                  user: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
              },
              messages: {
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  body: true,
                  senderId: true,
                  createdAt: true,
                  editedAt: true,
                  deletedAt: true,
                  sender: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!report) throw new AppError(404, 'Denúncia não encontrada', 'REPORT_NOT_FOUND')

  // Audit trail: every admin view of private thread content is logged.
  await logAudit({
    userId: req.user!.userId,
    action: 'MESSAGE_REPORT_VIEWED',
    entity: 'message_report',
    entityId: id,
    details: `Admin opened report ${id} for thread ${report.message.threadId}`,
    ipAddress: req.ip,
  })

  res.json(report)
})

export const resolveMessageReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const { action, resolution } = req.body as ResolveReportInput

  const report = await prisma.messageReport.findUnique({ where: { id } })
  if (!report) throw new AppError(404, 'Denúncia não encontrada', 'REPORT_NOT_FOUND')
  if (report.status !== 'PENDING') {
    throw new AppError(400, 'Denúncia já foi processada', 'REPORT_ALREADY_RESOLVED')
  }

  const updated = await prisma.messageReport.update({
    where: { id },
    data: {
      status: action,
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      resolution: resolution ?? null,
    },
  })

  await logAudit({
    userId: req.user!.userId,
    action: action === 'RESOLVED' ? 'MESSAGE_REPORT_RESOLVED' : 'MESSAGE_REPORT_DISMISSED',
    entity: 'message_report',
    entityId: id,
    details: resolution ? `Resolution: ${resolution.slice(0, 120)}` : undefined,
    ipAddress: req.ip,
  })

  res.json(updated)
})

// ──────────────────────────────────────────────────────────────────────
// Service reports moderation + service suspension
// ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/service-reports?status=PENDING
 */
export const listServiceReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const status = (req.query.status as string | undefined) ?? 'PENDING'
  if (!['PENDING', 'RESOLVED', 'DISMISSED'].includes(status)) {
    throw new AppError(400, 'Estado inválido', 'INVALID_STATUS')
  }

  const where = { status: status as 'PENDING' | 'RESOLVED' | 'DISMISSED' }

  const [reports, total] = await Promise.all([
    prisma.serviceReport.findMany({
      where,
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
        service: {
          select: {
            id: true,
            title: true,
            status: true,
            priceCents: true,
            priceUnit: true,
            providerId: true,
            provider: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      skip,
      take: limit,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.serviceReport.count({ where }),
  ])

  res.json(paginatedResponse(reports, total, page, limit))
})

/**
 * GET /api/admin/service-reports/:id — full context for moderation.
 */
export const getServiceReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const report = await prisma.serviceReport.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
      reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: {
        include: {
          provider: { select: { id: true, firstName: true, lastName: true, email: true } },
          category: { select: { id: true, nameSlug: true, namePt: true } },
          district: { select: { id: true, namePt: true } },
          municipality: { select: { id: true, namePt: true } },
          photos: { select: { id: true, url: true, sortOrder: true } },
        },
      },
    },
  })
  if (!report) throw new AppError(404, 'Denúncia não encontrada', 'REPORT_NOT_FOUND')

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REPORT_VIEWED',
    entity: 'service_report',
    entityId: id,
    details: `Admin opened report ${id} for service ${report.serviceId}`,
    ipAddress: req.ip,
  })

  res.json(report)
})

/**
 * PATCH /api/admin/service-reports/:id/resolve
 * Body: { resolution }. Marks the report RESOLVED; does not touch the service
 * itself — use /admin/services/:id/suspend for that (separate, auditable step).
 */
export const resolveServiceReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const { resolution } = req.body as ResolveServiceReportInput

  const report = await prisma.serviceReport.findUnique({ where: { id } })
  if (!report) throw new AppError(404, 'Denúncia não encontrada', 'REPORT_NOT_FOUND')
  if (report.status !== 'PENDING') {
    throw new AppError(400, 'Denúncia já foi processada', 'REPORT_ALREADY_RESOLVED')
  }

  const updated = await prisma.serviceReport.update({
    where: { id },
    data: {
      status: 'RESOLVED',
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      resolution,
    },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REPORT_RESOLVED',
    entity: 'service_report',
    entityId: id,
    details: `Resolution: ${resolution.slice(0, 120)}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

/**
 * PATCH /api/admin/service-reports/:id/dismiss
 * Marks the report as DISMISSED (no action needed). Optional resolution note.
 */
export const dismissServiceReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const { resolution } = req.body as ResolveServiceReportInput

  const report = await prisma.serviceReport.findUnique({ where: { id } })
  if (!report) throw new AppError(404, 'Denúncia não encontrada', 'REPORT_NOT_FOUND')
  if (report.status !== 'PENDING') {
    throw new AppError(400, 'Denúncia já foi processada', 'REPORT_ALREADY_RESOLVED')
  }

  const updated = await prisma.serviceReport.update({
    where: { id },
    data: {
      status: 'DISMISSED',
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      resolution,
    },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REPORT_DISMISSED',
    entity: 'service_report',
    entityId: id,
    details: `Dismissed: ${resolution.slice(0, 120)}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

/**
 * POST /api/admin/services/:id/suspend
 * Body: { reason }. Moves a service to SUSPENDED and records the reason.
 * This is the admin-side analogue of the owner soft-delete; it is final
 * (no transition back, per SERVICE_STATUS_TRANSITIONS).
 */
export const adminSuspendService = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const { reason } = req.body as SuspendServiceInput

  const service = await prisma.service.findUnique({ where: { id } })
  if (!service) throw new AppError(404, 'Anúncio não encontrado', 'SERVICE_NOT_FOUND')
  if (service.status === 'SUSPENDED') {
    throw new AppError(400, 'Anúncio já se encontra suspenso', 'ALREADY_SUSPENDED')
  }

  const updated = await prisma.service.update({
    where: { id },
    data: {
      status: 'SUSPENDED',
      removedAt: new Date(),
      removedReason: reason,
    },
    select: { id: true, title: true, status: true, removedAt: true, removedReason: true },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_SUSPENDED',
    entity: 'service',
    entityId: id,
    details: `Reason: ${reason.slice(0, 120)}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

/**
 * GET /api/admin/services
 * Lists all services (any status) with optional filters: status, q, page, limit.
 * Includes provider, category and basic location for moderation context.
 */
export const listAllServices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()

  const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED']
  const where: Record<string, unknown> = {}
  if (status && validStatuses.includes(status)) where.status = status
  if (q && q.length > 0) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        category: { select: { id: true, nameSlug: true, namePt: true } },
        district: { select: { id: true, namePt: true } },
        municipality: { select: { id: true, namePt: true } },
        photos: {
          where: { sortOrder: 0 },
          select: { url: true },
          take: 1,
        },
        _count: { select: { reports: { where: { status: 'PENDING' } } } },
      },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.service.count({ where }),
  ])

  res.json(paginatedResponse(services, total, page, limit))
})

/**
 * POST /api/admin/services/:id/reactivate
 * Reactivates a SUSPENDED service back to ACTIVE. Clears removal metadata.
 * Admin-only escape hatch outside the owner-facing transition rules.
 */
export const adminReactivateService = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const service = await prisma.service.findUnique({ where: { id } })
  if (!service) throw new AppError(404, 'Anúncio não encontrado', 'SERVICE_NOT_FOUND')
  if (service.status !== 'SUSPENDED') {
    throw new AppError(400, 'Apenas anúncios suspensos podem ser reactivados', 'NOT_SUSPENDED')
  }

  const updated = await prisma.service.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      removedAt: null,
      removedReason: null,
    },
    select: { id: true, title: true, status: true },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REACTIVATED',
    entity: 'service',
    entityId: id,
    details: `Reactivated by admin`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

// ─────────────────────────────────────────────────────────────────────
// Featured (homepage destaques) — admin-controlado
// ─────────────────────────────────────────────────────────────────────

const FEATURE_DURATION_DAYS_MAX = 365

function parseFeaturedUntil(body: unknown): Date | null {
  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'Body invalido', 'INVALID_BODY')
  }
  const b = body as { until?: unknown; days?: unknown }

  // Permite payload { until: ISOString | null } ou { days: number }
  if (b.until === null) return null
  if (typeof b.until === 'string') {
    const d = new Date(b.until)
    if (isNaN(d.getTime())) {
      throw new AppError(400, 'Data invalida', 'INVALID_DATE')
    }
    return d
  }
  if (typeof b.days === 'number' && Number.isFinite(b.days)) {
    if (b.days <= 0 || b.days > FEATURE_DURATION_DAYS_MAX) {
      throw new AppError(400, 'Numero de dias invalido', 'INVALID_DAYS')
    }
    const d = new Date()
    d.setDate(d.getDate() + b.days)
    return d
  }
  throw new AppError(400, 'Forneca { until: ISO } ou { days: number }', 'INVALID_PAYLOAD')
}

export const setServiceFeatured = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const featuredUntil = parseFeaturedUntil(req.body)

  const service = await prisma.service.findUnique({ where: { id }, select: { id: true } })
  if (!service) throw new AppError(404, 'Servico nao encontrado', 'SERVICE_NOT_FOUND')

  const updated = await prisma.service.update({
    where: { id },
    data: { featuredUntil },
    select: { id: true, title: true, featuredUntil: true },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_FEATURED',
    entity: 'service',
    entityId: id,
    details: featuredUntil ? `Promoted until ${featuredUntil.toISOString()}` : 'Promotion removed',
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const setBreederFeatured = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const featuredUntil = parseFeaturedUntil(req.body)

  const breeder = await prisma.breeder.findUnique({ where: { id }, select: { id: true } })
  if (!breeder) throw new AppError(404, 'Criador nao encontrado', 'BREEDER_NOT_FOUND')

  const updated = await prisma.breeder.update({
    where: { id },
    data: { featuredUntil },
    select: { id: true, businessName: true, featuredUntil: true },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'BREEDER_FEATURED',
    entity: 'Breeder',
    entityId: id,
    details: featuredUntil ? `Promoted until ${featuredUntil.toISOString()}` : 'Promotion removed',
    ipAddress: req.ip,
  })

  res.json(updated)
})
