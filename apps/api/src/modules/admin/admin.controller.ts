import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, parsePagination, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import type { ResolveReportInput } from '@patacerta/shared'

export const getPendingCounts = asyncHandler(async (_req, res) => {
  const [pendingDocs, pendingBreeders, flaggedReviews, pendingMessageReports] = await Promise.all([
    prisma.verificationDoc.count({ where: { status: 'PENDING' } }),
    prisma.breeder.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.review.count({ where: { status: 'FLAGGED' } }),
    prisma.messageReport.count({ where: { status: 'PENDING' } }),
  ])

  res.json({
    pendingDocs,
    pendingBreeders,
    flaggedReviews,
    pendingMessageReports,
    total: pendingDocs + pendingBreeders + flaggedReviews + pendingMessageReports,
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
    totalMessages,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.breeder.count(),
    prisma.breeder.count({ where: { status: 'VERIFIED' } }),
    prisma.verificationDoc.count({ where: { status: 'PENDING' } }),
    prisma.review.count(),
    prisma.review.count({ where: { status: 'FLAGGED' } }),
    prisma.message.count(),
  ])

  res.json({
    users: { total: totalUsers },
    breeders: { total: totalBreeders, verified: verifiedBreeders },
    verifications: { pending: pendingVerifications },
    reviews: { total: totalReviews, flagged: flaggedReviews },
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
  const where = { status: 'FLAGGED' as const }

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

  res.json(paginatedResponse(reviews, total, page, limit))
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
