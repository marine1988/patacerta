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

  const reason = (req.body as { reason?: string } | undefined)?.reason?.trim() ?? ''

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')
  if (!user.isActive) throw new AppError(400, 'Utilizador já está suspenso', 'ALREADY_SUSPENDED')
  // Defesa em profundidade: um admin nao pode suspender outro admin sem
  // remocao explicita do papel primeiro. Evita que uma conta admin
  // comprometida purgue silenciosamente os outros admins.
  if (user.role === 'ADMIN') {
    throw new AppError(
      403,
      'Não pode suspender outro administrador. Remova primeiro o papel ADMIN.',
      'CANNOT_SUSPEND_ADMIN',
    )
  }

  // Deactivate user account
  await prisma.user.update({
    where: { id },
    data: { isActive: false, suspendedAt: new Date(), suspendedReason: reason },
  })

  if (user.role === 'BREEDER') {
    await prisma.breeder.updateMany({
      where: { userId: id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason },
    })
  }

  await logAudit({
    userId: req.user!.userId,
    action: 'SUSPEND_USER',
    entity: 'User',
    entityId: id,
    details: `Suspended user ${user.email}: ${reason}`,
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

// Apenas SUSPEND / UNSUSPEND sao expostos como acoes do admin.
// A transicao para VERIFIED so acontece quando o admin aprova o
// documento DGAV em PATCH /verification/:docId/review. Isto evita que
// um admin promova um criador sem haver DGAV validado.
export const suspendBreeder = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const reason = (req.body as { reason?: string } | undefined)?.reason?.trim() ?? ''

  const breeder = await prisma.breeder.findUnique({
    where: { id },
    include: { user: { select: { id: true, role: true } } },
  })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')

  // Idempotencia + preservacao forensica: re-suspender sobrescrevia
  // suspendedAt/suspendedReason originais. Rejeitamos.
  if (breeder.status === 'SUSPENDED') {
    throw new AppError(400, 'Criador já está suspenso', 'ALREADY_SUSPENDED')
  }

  // Peer-admin protection: nao permite suspender perfil de criador cujo
  // utilizador associado seja ADMIN (consistente com suspendUser).
  if (breeder.user.role === 'ADMIN') {
    throw new AppError(
      403,
      'Não pode suspender o perfil de outro administrador.',
      'CANNOT_SUSPEND_ADMIN',
    )
  }
  if (breeder.user.id === req.user!.userId) {
    throw new AppError(400, 'Não pode suspender o seu próprio perfil', 'SELF_SUSPEND')
  }

  const updated = await prisma.breeder.update({
    where: { id },
    data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason },
    select: { id: true, businessName: true, status: true },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SUSPEND_BREEDER',
    entity: 'Breeder',
    entityId: id,
    details: `Breeder suspended by admin: ${reason}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const unsuspendBreeder = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const breeder = await prisma.breeder.findUnique({
    where: { id },
    include: { verificationDocs: true },
  })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.status !== 'SUSPENDED') {
    throw new AppError(400, 'Criador nao esta suspenso', 'NOT_SUSPENDED')
  }

  // Ao reactivar, o status volta para o que faria sentido pelo estado
  // dos documentos: se houver DGAV APPROVED -> VERIFIED, caso contrario
  // -> DRAFT (criador volta a poder enviar/ressubmeter o DGAV).
  const dgavApproved = breeder.verificationDocs.some(
    (d) => d.docType === 'DGAV' && d.status === 'APPROVED',
  )
  const nextStatus = dgavApproved ? 'VERIFIED' : 'DRAFT'

  const updated = await prisma.breeder.update({
    where: { id },
    data: {
      status: nextStatus,
      verifiedAt: dgavApproved ? (breeder.verifiedAt ?? new Date()) : null,
      suspendedAt: null,
      suspendedReason: null,
    },
    select: { id: true, businessName: true, status: true },
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'UNSUSPEND_BREEDER',
    entity: 'Breeder',
    entityId: id,
    details: `Breeder reactivated as ${nextStatus}`,
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

  // type === 'all' — paginate via UNION ALL on the DB, then hydrate by id.
  // Counts are cheap (indexed on status); the union only returns (id, type, createdAt)
  // for the requested page, then we fetch full payloads for those ids.
  type UnionRow = { id: number; kind: 'breeder' | 'service'; created_at: Date }
  const [breederTotal, serviceTotal, unionRows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.serviceReview.count({ where }),
    prisma.$queryRaw<UnionRow[]>`
      SELECT id, 'breeder' AS kind, created_at
      FROM reviews
      WHERE status = 'FLAGGED'
      UNION ALL
      SELECT id, 'service' AS kind, created_at
      FROM service_reviews
      WHERE status = 'FLAGGED'
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `,
  ])

  const total = breederTotal + serviceTotal
  const breederIds = unionRows.filter((r) => r.kind === 'breeder').map((r) => r.id)
  const serviceIds = unionRows.filter((r) => r.kind === 'service').map((r) => r.id)

  const [breederReviews, serviceReviews] = await Promise.all([
    breederIds.length === 0
      ? []
      : prisma.review.findMany({
          where: { id: { in: breederIds } },
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
        }),
    serviceIds.length === 0
      ? []
      : prisma.serviceReview.findMany({
          where: { id: { in: serviceIds } },
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
        }),
  ])

  const breederById = new Map(breederReviews.map((r) => [r.id, r]))
  const serviceById = new Map(serviceReviews.map((r) => [r.id, r]))

  // Preserve the union's ordering (already sorted by createdAt desc).
  const paged = unionRows
    .map((row) => {
      if (row.kind === 'breeder') {
        const r = breederById.get(row.id)
        return r ? { ...r, type: 'breeder' as const } : null
      }
      const r = serviceById.get(row.id)
      return r ? { ...r, type: 'service' as const } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

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
              service: {
                select: {
                  id: true,
                  title: true,
                  provider: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                  },
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

/**
 * Validacao primaria e feita pelo Zod (featuredPayloadSchema): aqui apenas
 * convertemos o payload ja-validado em Date | null. O guard FEATURE_DURATION_DAYS_MAX
 * mantem-se como defesa-em-profundidade caso o schema seja relaxado no futuro.
 */
function parseFeaturedUntil(body: unknown): Date | null {
  const b = body as { until?: string | null; days?: number }

  if (b.until === null) return null
  if (typeof b.until === 'string') {
    const d = new Date(b.until)
    if (isNaN(d.getTime())) {
      throw new AppError(400, 'Data invalida', 'INVALID_DATE')
    }
    return d
  }
  if (typeof b.days === 'number') {
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
