import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, parsePagination, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import { maskEmail } from '../../lib/redact.js'
import { invalidateFeaturedCache } from '../home/home.controller.js'
import { spawn } from 'node:child_process'
import { resolve as pathResolve } from 'node:path'
import { existsSync } from 'node:fs'
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
  // Query validada/coerced em admin.router via listUsersQuerySchema.
  const { page, limit, role, q } = req.query as unknown as {
    page: number
    limit: number
    role?: 'OWNER' | 'BREEDER' | 'SERVICE_PROVIDER' | 'ADMIN'
    q?: string
  }
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (role) where.role = role
  if (q) {
    // Pesquisa case-insensitive em nome (firstName/lastName) e email.
    // Util para encontrar utilizadores em listas grandes sem ter de
    // paginar manualmente. Se `q` for inteiro, tambem aceita match
    // exacto por id (atalho para deep-links e suporte ao admin).
    const qNum = /^\d+$/.test(q) ? Number(q) : null
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      ...(qNum !== null && Number.isSafeInteger(qNum) ? [{ id: qNum }] : []),
    ]
  }

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
        isActive: true,
        suspendedAt: true,
        suspendedReason: true,
        breeder: { select: { id: true, status: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ])

  // Trilho forense de acessos administrativos a listagens com PII (emails
  // de todos os utilizadores). Em caso de leak interno, permite identificar
  // qual admin viu a listagem em que momento e com que filtros.
  //
  // Se `q` parecer um email, mascaramos antes de gravar no audit log
  // — caso contrario o email completo de qualquer utilizador pesquisado
  // ficaria persistido em texto claro em ``audit_logs``.
  const qForAudit = q
    ? q.includes('@')
      ? maskEmail(q.slice(0, 100))
      : q.slice(0, 50)
    : ''
  await logAudit({
    userId: req.user!.userId,
    action: 'ADMIN_LIST_USERS',
    entity: 'User',
    details: `page=${page} limit=${limit}${role ? ` role=${role}` : ''}${qForAudit ? ` q="${qForAudit}"` : ''}`,
    ipAddress: req.ip,
  })

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

  // Transacao garante atomicidade entre user.update e breeder.updateMany:
  // se a segunda falhar, a conta nao fica suspensa "sozinha" deixando o
  // criador ainda publicamente visivel. Importante para fluxo de moderacao.
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    // Deactivate user account
    await tx.user.update({
      where: { id },
      data: { isActive: false, suspendedAt: now, suspendedReason: reason },
    })

    // Revogar TODAS as sessoes activas. Sem isto, o refresh token do
    // utilizador suspenso continuava valido (ate 7d) e podia ser usado
    // para emitir novos access tokens que passavam `requireAuth` (que
    // so verifica assinatura). O `requireActiveUser` apanha mutations
    // mas /auth/refresh nao o usa — pelo que a janela de utilizacao
    // efectiva da sessao suspensa podia ser dias. Revogacao explicita
    // fecha esta janela e e' coerente com o que `resetPassword` ja faz.
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: now },
    })

    if (user.role === 'BREEDER') {
      await tx.breeder.updateMany({
        where: { userId: id },
        // featuredUntil: null — se a conta era um criador destacado,
        // ao suspender a conta o destaque deixa de fazer sentido. Sem
        // este reset, o criador continuava na homepage ate' a featured
        // window expirar naturalmente (ou ate' o cache cair). Ver
        // tambem suspendBreeder, que tem o mesmo cuidado.
        data: {
          status: 'SUSPENDED',
          suspendedAt: now,
          suspendedReason: reason,
          featuredUntil: null,
        },
      })
    }
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'SUSPEND_USER',
    entity: 'User',
    entityId: id,
    details: `Suspended user ${maskEmail(user.email)}: ${reason}`,
    ipAddress: req.ip,
  })

  // Invalida cache de destaques caso o criador suspenso estivesse la'.
  // Best-effort: se falhar, o TTL do cache (~5 min) acabara' por
  // reconciliar; nao bloqueamos a suspensao por causa disto.
  if (user.role === 'BREEDER') {
    await invalidateFeaturedCache().catch(() => undefined)
  }

  res.status(204).send()
})

/**
 * Reactiva uma conta de utilizador previamente suspensa.
 *
 * Limpa `isActive=true` + `suspendedAt`/`suspendedReason`. Se o
 * utilizador tem perfil de criador associado e este foi suspenso na
 * sequencia da suspensao da conta (status=SUSPENDED), reactiva-o
 * tambem com a logica do `unsuspendBreeder`: VERIFIED se o DGAV
 * permanecia aprovado, DRAFT caso contrario. Assim a reactivacao da
 * conta nao deixa o criador num limbo.
 *
 * Retorna 204 (mesma convencao do suspendUser).
 */
export const unsuspendUser = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      breeder: { include: { verificationDocs: true } },
    },
  })
  if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')
  if (user.isActive) throw new AppError(400, 'Utilizador não está suspenso', 'NOT_SUSPENDED')

  // Transacao garante atomicidade da reactivacao: ou a conta reactiva
  // E o criador associado e' restaurado para o estado correcto (VERIFIED
  // ou DRAFT consoante o DGAV), ou nenhum dos dois muda.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { isActive: true, suspendedAt: null, suspendedReason: null },
    })

    // Se o criador associado tambem ficou SUSPENDED em consequencia da
    // suspensao da conta, reactiva-o aplicando a mesma regra usada em
    // unsuspendBreeder. Se o admin suspendeu o criador isoladamente
    // (sem suspender a conta), nao mexemos aqui — fica para o fluxo
    // dedicado em /admin/breeders/:id/unsuspend.
    if (user.breeder && user.breeder.status === 'SUSPENDED') {
      const dgavApproved = user.breeder.verificationDocs.some(
        (d) => d.docType === 'DGAV' && d.status === 'APPROVED',
      )
      const nextStatus = dgavApproved ? 'VERIFIED' : 'DRAFT'
      await tx.breeder.update({
        where: { id: user.breeder.id },
        data: {
          status: nextStatus,
          verifiedAt: dgavApproved ? (user.breeder.verifiedAt ?? new Date()) : null,
          suspendedAt: null,
          suspendedReason: null,
        },
      })
    }
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'UNSUSPEND_USER',
    entity: 'User',
    entityId: id,
    details: `Reactivated user ${maskEmail(user.email)}`,
    ipAddress: req.ip,
  })

  res.status(204).send()
})

/**
 * Detalhe completo de um utilizador para o painel de admin.
 *
 * Devolve perfil + perfil de criador (se aplicavel) + servicos
 * publicados + contagens agregadas + os ultimos 50 audit logs em que
 * o utilizador foi alvo (entity ~ 'User' case-insensitive). Tambem
 * devolve denuncias feitas e recebidas (head 10 cada) para inspeccao
 * rapida sem ter de saltar para outras tabs.
 *
 * Nao inclui passwordHash, resetToken nem tokens de email — esses
 * campos nunca devem sair da API.
 */
export const getUserDetail = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
      avatarUrl: true,
      isActive: true,
      suspendedAt: true,
      suspendedReason: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      breeder: {
        select: {
          id: true,
          businessName: true,
          slug: true,
          nif: true,
          dgavNumber: true,
          status: true,
          verifiedAt: true,
          suspendedAt: true,
          suspendedReason: true,
          avgRating: true,
          reviewCount: true,
          featuredUntil: true,
          createdAt: true,
        },
      },
      services: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          priceCents: true,
          priceUnit: true,
          currency: true,
          avgRating: true,
          reviewCount: true,
          createdAt: true,
          publishedAt: true,
          removedAt: true,
          removedReason: true,
          featuredUntil: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          sentMessages: true,
          threadsAsOwner: true,
          reviews: true,
          serviceReviews: true,
          messageReportsFiled: true,
          serviceReportsFiled: true,
          refreshTokens: true,
          auditLogs: true,
        },
      },
    },
  })
  if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')

  // Audit trail focado no utilizador alvo (NAO o actor). Limitamos a
  // 50 entradas — chega para uma visao executiva sem inundar o JSON.
  const targetedAuditLogs = await prisma.auditLog.findMany({
    where: {
      entity: { equals: 'User', mode: 'insensitive' },
      entityId: id,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })

  // Denuncias feitas pelo utilizador (head 10) — util para detectar
  // padroes de abuso (denunciante serial). Inclui o estado e um pouco
  // de contexto da entidade alvo.
  const messageReportsFiled = await prisma.messageReport.findMany({
    where: { reporterId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      message: {
        select: {
          id: true,
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  })
  const serviceReportsFiled = await prisma.serviceReport.findMany({
    where: { reporterId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      service: { select: { id: true, title: true, slug: true } },
    },
  })

  // Denuncias recebidas — apenas service reports (mensagens nao tem
  // relacao directa pelo `reportedUser`, sao por `messageId`). Para
  // mensagens, fariamos join via Message.senderId, mas isso obriga a
  // varrer todas as denuncias — preferimos lazy-load se necessario
  // numa segunda fase.
  const serviceReportsReceived = await prisma.serviceReport.findMany({
    where: { service: { providerId: id } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: { select: { id: true, title: true, slug: true } },
    },
  })

  // Trilho forense de acesso a PII completa de um utilizador (email,
  // telefone, audit history, denuncias). Action separada de
  // ADMIN_LIST_USERS para distinguir browse vs deep-dive em forense.
  await logAudit({
    userId: req.user!.userId,
    action: 'ADMIN_VIEW_USER',
    entity: 'User',
    entityId: id,
    ipAddress: req.ip,
  })

  res.json({
    user,
    auditLogs: targetedAuditLogs,
    reportsFiled: {
      messages: messageReportsFiled,
      services: serviceReportsFiled,
    },
    reportsReceived: {
      services: serviceReportsReceived,
    },
  })
})

export const listAllBreeders = asyncHandler(async (req, res) => {
  // Query validada/coerced em admin.router via listBreedersQuerySchema.
  const { page, limit, status } = req.query as unknown as {
    page: number
    limit: number
    status?: 'DRAFT' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'SUSPENDED'
  }
  const skip = (page - 1) * limit

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

// Detalhe completo de um criador para a pagina /admin/criadores/:id.
//
// Inclui dados que o admin precisa para verificar o cartao DGAV e
// confirmar identidade do criador:
//  - Perfil completo (todos os campos, incluindo morada e flags)
//  - Dono (user) com email, telefone, role, datas de criacao e verificacao
//  - District + municipality completos
//  - Especies + racas autorizadas (com nome PT do catalogo)
//  - TODOS os verification docs (qualquer status), com info do reviewer
//    para historico (quem aprovou/rejeitou e quando)
//  - Contagens agregadas (reviews, photos, threads)
//
// O ficheiro em si nao e' devolvido aqui — frontend usa
// GET /verification/:docId/view para presigned URL on-demand.
export const getBreederDetail = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const breeder = await prisma.breeder.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          createdAt: true,
        },
      },
      district: { select: { id: true, namePt: true, code: true } },
      municipality: { select: { id: true, namePt: true, code: true } },
      species: {
        include: {
          species: { select: { id: true, nameSlug: true, namePt: true } },
        },
      },
      breeds: {
        include: {
          breed: { select: { id: true, nameSlug: true, namePt: true } },
        },
      },
      verificationDocs: {
        // Ordem: PENDING primeiro (precisam de accao), depois mais recentes.
        // Prisma nao suporta ordering por enum custom — usamos createdAt desc
        // como proxy razoavel (docs novos sao normalmente PENDING).
        orderBy: { createdAt: 'desc' },
        include: {
          reviewer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
      _count: {
        select: {
          reviews: true,
          photos: true,
          threadsAsBreeder: true,
          breeds: true,
        },
      },
    },
  })

  if (!breeder) {
    throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  }

  // Audit deep-view: este endpoint expoe PII sensivel — email + telefone
  // do dono, NIF, numero DGAV, todos os docs de verificacao com info do
  // reviewer. Equivalente ao ADMIN_VIEW_USER em getUserDetail, que
  // existe pelo mesmo motivo. Listagens (getPendingVerifications,
  // listAllBreeders) nao precisam porque expoem so identificadores +
  // status — o detalhe individual e' que e' o vector de extraccao.
  await logAudit({
    userId: req.user!.userId,
    action: 'ADMIN_VIEW_BREEDER',
    entity: 'Breeder',
    entityId: id,
    ipAddress: req.ip,
  })

  res.json(breeder)
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
    // featuredUntil: null — coerencia com a regra em setBreederFeatured,
    // que so permite promover criadores VERIFIED. Sem isto, um criador
    // suspenso continuava na homepage ate' a featured window expirar ou
    // o cache (5 min TTL) cair. Mesmo padrao em suspendUser.
    data: {
      status: 'SUSPENDED',
      suspendedAt: new Date(),
      suspendedReason: reason,
      featuredUntil: null,
    },
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

  // Best-effort invalidacao do cache de destaques: se falhar, o TTL
  // acabara' por reconciliar. Nao bloqueamos a suspensao.
  await invalidateFeaturedCache().catch(() => undefined)

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
  // Query validada/coerced em admin.router via flaggedReviewsQuerySchema.
  const { page, limit, type } = req.query as unknown as {
    page: number
    limit: number
    type: 'breeder' | 'service' | 'all'
  }
  const skip = (page - 1) * limit
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
  // Query validada/coerced em admin.router via auditLogsQuerySchema.
  const { page, limit, action, entity, userId, dateFrom, dateTo } = req.query as unknown as {
    page: number
    limit: number
    action?: string
    entity?: string
    userId?: number
    dateFrom?: string
    dateTo?: string
  }
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  // Filtros usam `contains` case-insensitive para suportar agrupamentos
  // (ex.: "VERIFICATION" matches VERIFICATION_DOC_APPROVED, etc.) e
  // tolerar inconsistencias historicas no schema (Breeder vs breeder,
  // SERVICE.UPDATE vs service.create).
  if (action) where.action = { contains: action, mode: 'insensitive' }
  if (entity) where.entity = { equals: entity, mode: 'insensitive' }
  if (userId) where.userId = userId

  // Intervalo de datas inclusivo. dateTo cobre o dia inteiro (23:59:59.999).
  // Schema garante que ambos parseiam para Date válida.
  const createdAt: Record<string, Date> = {}
  if (dateFrom) {
    createdAt.gte = new Date(dateFrom)
  }
  if (dateTo) {
    const d = new Date(dateTo)
    d.setHours(23, 59, 59, 999)
    createdAt.lte = d
  }
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt

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
  // Query validada/coerced em admin.router via listReportsQuerySchema.
  const { page, limit, status } = req.query as unknown as {
    page: number
    limit: number
    status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  }
  const skip = (page - 1) * limit

  const where = { status }

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

  // Trilho forense: cada listagem de denuncias revela bodies de
  // mensagens privadas (linha 876 inclui ``body``). Logamos o acesso
  // tal como em getMessageReport para detectar abuso por admins.
  await logAudit({
    userId: req.user!.userId,
    action: 'MESSAGE_REPORTS_LISTED',
    entity: 'MessageReport',
    details: `page=${page} limit=${limit} status=${status} count=${reports.length}`,
    ipAddress: req.ip,
  })

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
  // Query validada/coerced em admin.router via listReportsQuerySchema.
  const { page, limit, status } = req.query as unknown as {
    page: number
    limit: number
    status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  }
  const skip = (page - 1) * limit

  const where = { status }

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

  // Trilho forense: a listagem expoe emails de reporter e provider e
  // razoes de denuncia. Coerencia com listMessageReports, que ja regista
  // o acesso pelos mesmos motivos.
  await logAudit({
    userId: req.user!.userId,
    action: 'SERVICE_REPORTS_LISTED',
    entity: 'ServiceReport',
    details: `page=${page} limit=${limit} status=${status} count=${reports.length}`,
    ipAddress: req.ip,
  })

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
 * Admin pode reverter mais tarde via adminReactivateService — fora das
 * regras de transicao do owner-facing flow (SERVICE_STATUS_TRANSITIONS),
 * que nao permitem SUSPENDED->ACTIVE pelo proprio dono.
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
    // featuredUntil: null — setServiceFeatured impede promover servicos
    // nao-ACTIVE, mas sem reset aqui um servico actualmente destacado
    // continuaria na homepage de destaques ate' a window expirar ou o
    // cache (~5 min) cair. Mesmo padrao em suspendBreeder / suspendUser.
    data: {
      status: 'SUSPENDED',
      removedAt: new Date(),
      removedReason: reason,
      featuredUntil: null,
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

  // Best-effort invalidacao do cache. Se falhar, o TTL reconcilia.
  await invalidateFeaturedCache().catch(() => undefined)

  res.json(updated)
})

/**
 * GET /api/admin/services
 * Lists all services (any status) with optional filters: status, q, page, limit.
 * Includes provider, category and basic location for moderation context.
 */
export const listAllServices = asyncHandler(async (req, res) => {
  // Query validada/coerced em admin.router via listAllServicesQuerySchema.
  const { page, limit, status, q } = req.query as unknown as {
    page: number
    limit: number
    status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED'
    q?: string
  }
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status) where.status = status
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
    // Rejeitar datas no passado: equivaleria a um null mas confunde o
    // historial de auditoria ("Promoted until 2020-01-01") e contorna
    // implicitamente o status-check abaixo (status precisa de ser
    // ACTIVE/VERIFIED se until !== null). Para remover promocao, usar
    // explicitamente { until: null }.
    if (d.getTime() <= Date.now()) {
      throw new AppError(
        400,
        'Data de destaque tem de ser no futuro. Use { until: null } para remover.',
        'INVALID_DATE_PAST',
      )
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

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!service) throw new AppError(404, 'Servico nao encontrado', 'SERVICE_NOT_FOUND')
  // Promover servicos nao-ACTIVE faria com que conteudo pausado/suspenso
  // aparecesse em homepage/listagens de destaque. Bloqueamos a promocao;
  // a remocao (featuredUntil=null) e' sempre permitida para limpar
  // promocoes de servicos que entretanto foram suspensos.
  if (featuredUntil !== null && service.status !== 'ACTIVE') {
    throw new AppError(
      400,
      'So pode destacar servicos em estado ACTIVE',
      'SERVICE_NOT_ACTIVE_FOR_FEATURED',
    )
  }

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

  // Invalida cache da homepage para o toggle ser visivel imediatamente
  // em vez de esperar TTL (60s). Best-effort: a falha do cacheDel nao
  // bloqueia a mutacao, no pior caso espera o TTL.
  await invalidateFeaturedCache().catch(() => undefined)

  res.json(updated)
})

export const setBreederFeatured = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const featuredUntil = parseFeaturedUntil(req.body)

  const breeder = await prisma.breeder.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!breeder) throw new AppError(404, 'Criador nao encontrado', 'BREEDER_NOT_FOUND')
  if (featuredUntil !== null && breeder.status !== 'VERIFIED') {
    throw new AppError(
      400,
      'So pode destacar criadores em estado VERIFIED',
      'BREEDER_NOT_VERIFIED_FOR_FEATURED',
    )
  }

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

  await invalidateFeaturedCache().catch(() => undefined)

  res.json(updated)
})

/**
 * POST /admin/internal/run-demo-seed
 *
 * Executa o script `prisma/seed-demo.ts` on-demand. Util quando a flag
 * `RUN_SEED_DEMO_ON_BOOT` nao foi aplicada pelo orquestrador (Dokploy)
 * mas o admin precisa de popular o staging com dados fake.
 *
 * Restricoes:
 *  - Apenas role ADMIN (validado por requireRole no router).
 *  - Apenas fora de produccao (`NODE_ENV !== 'production'`) — em prod
 *    o seed-demo cria users/NIFs falsos, totalmente inadequado.
 *  - Spawn de processo separado: isola o ciclo de vida (Prisma client
 *    proprio, exit code claro) e nao polui o event-loop da API.
 *  - Timeout 5min: o seed-demo demora ~30-60s; 5min e' folga generosa.
 */
export const runDemoSeed = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError(403, 'Demo seed nao pode correr em produccao', 'FORBIDDEN_IN_PRODUCTION')
  }

  const adminUserId = req.user!.userId
  const started = Date.now()
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  let exitCode = -1

  await new Promise<void>((resolve, reject) => {
    // No container Docker o cwd do API pode ser `/app` (raiz do monorepo)
    // em vez de `/app/apps/api`. Resolver explicitamente o caminho do
    // script tentando varios candidatos para suportar tanto runtime
    // containerizado como execucao local (`pnpm dev`).
    const candidates = [
      pathResolve(process.cwd(), 'apps/api/prisma/seed-demo.ts'),
      pathResolve(process.cwd(), 'prisma/seed-demo.ts'),
      '/app/apps/api/prisma/seed-demo.ts',
    ]
    let scriptPath: string | null = null
    for (const c of candidates) {
      if (existsSync(c)) {
        scriptPath = c
        break
      }
    }
    if (!scriptPath) {
      reject(
        new AppError(
          500,
          `seed-demo.ts nao encontrado (tried: ${candidates.join(', ')})`,
          'SEED_SCRIPT_NOT_FOUND',
        ),
      )
      return
    }

    // Cwd do spawn = directorio do script (para imports relativos / .env).
    const cwd = pathResolve(scriptPath, '..', '..')

    const child = spawn('npx', ['tsx', scriptPath], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeout = setTimeout(
      () => {
        child.kill('SIGTERM')
        reject(new AppError(504, 'Demo seed excedeu 5 minutos', 'SEED_TIMEOUT'))
      },
      5 * 60 * 1000,
    )

    child.stdout.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8')
      stdoutChunks.push(s)
      process.stdout.write(`[seed-demo] ${s}`)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8')
      stderrChunks.push(s)
      process.stderr.write(`[seed-demo:err] ${s}`)
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      exitCode = code ?? -1
      resolve()
    })
  }).catch((err) => {
    if (err instanceof AppError) throw err
    throw new AppError(500, `Demo seed falhou: ${(err as Error).message}`, 'SEED_SPAWN_ERROR')
  })

  const durationMs = Date.now() - started
  const stdout = stdoutChunks.join('')
  const stderr = stderrChunks.join('')

  await logAudit({
    userId: adminUserId,
    action: 'ADMIN_RUN_DEMO_SEED',
    entity: 'System',
    entityId: 0,
    details: `exitCode=${exitCode} durationMs=${durationMs} stdoutChars=${stdout.length} stderrChars=${stderr.length}`,
    ipAddress: req.ip,
  })

  if (exitCode !== 0) {
    res.status(500).json({
      ok: false,
      exitCode,
      durationMs,
      stdoutTail: stdout.slice(-3000),
      stderrTail: stderr.slice(-3000),
    })
    return
  }

  res.json({
    ok: true,
    exitCode,
    durationMs,
    stdoutTail: stdout.slice(-2000),
  })
})
