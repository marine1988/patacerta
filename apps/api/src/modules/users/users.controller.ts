import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, parsePagination, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import { uploadFile, deleteFile } from '../../lib/minio.js'
import { assertFileKind } from '../../lib/file-validation.js'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import { createSafeSharp } from '../../lib/sharp-safe.js'
import { randomUUID } from 'crypto'
import type { ChangeUserRoleInput } from '@patacerta/shared'

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  avatarUrl: true,
  createdAt: true,
}

export const getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      ...USER_SELECT,
      breeder: { select: { id: true, businessName: true, status: true } },
    },
  })
  if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')
  res.json(user)
})

export const updateMe = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, currentPassword, newPassword } = req.body

  const updateData: Record<string, unknown> = {}
  if (firstName) updateData.firstName = firstName
  if (lastName) updateData.lastName = lastName
  if (phone !== undefined) updateData.phone = phone || null

  let passwordChanged = false

  if (newPassword) {
    if (!currentPassword)
      throw new AppError(400, 'Palavra-passe atual é obrigatória', 'MISSING_CURRENT_PASSWORD')

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new AppError(400, 'Palavra-passe atual incorreta', 'INVALID_CURRENT_PASSWORD')

    updateData.passwordHash = await bcrypt.hash(newPassword, 12)
    passwordChanged = true
  }

  // Quando muda a password, revogamos todos os refresh tokens em
  // simultaneo (mesma transaccao) para forcar re-login de quaisquer
  // sessoes que ja estivessem activas — mitigacao classica para o cenario
  // "utilizador muda a password porque suspeita de compromisso".
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: req.user!.userId },
      data: updateData,
      select: USER_SELECT,
    })
    if (passwordChanged) {
      await tx.refreshToken.updateMany({
        where: { userId: req.user!.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    return u
  })

  if (passwordChanged) {
    await logAudit({
      userId: req.user!.userId,
      action: 'USER_PASSWORD_CHANGED',
      entity: 'User',
      entityId: req.user!.userId,
      details: 'Password rotated via /me; refresh tokens revoked',
      ipAddress: req.ip,
    })
  }

  res.json(updated)
})

export const deleteMe = asyncHandler(async (req, res) => {
  const userId = req.user!.userId

  // Guard: impedir que o último ADMIN activo se auto-elimine, deixando
  // o sistema sem administrador. Verificamos antes da transacção para
  // devolver erro claro.
  if (req.user!.role === 'ADMIN') {
    const activeAdminCount = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    })
    if (activeAdminCount <= 1) {
      throw new AppError(
        400,
        'Não é possível eliminar a conta: é o último administrador activo. Promova outro utilizador a administrador antes de eliminar a sua conta.',
        'LAST_ACTIVE_ADMIN',
      )
    }
  }

  // RGPD-compliant soft-delete: deactivate + pseudonymize personal data
  await prisma.$transaction(async (tx) => {
    // 1. Deactivate and pseudonymize the user
    const deletedTag = `deleted_${userId}_${Date.now()}`
    await tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: `${deletedTag}@eliminado.patacerta.pt`,
        firstName: 'Utilizador',
        lastName: 'Eliminado',
        phone: null,
        avatarUrl: null,
        passwordHash: '', // invalidate login
      },
    })

    // 2. If breeder, set status to SUSPENDED (effectively deactivated)
    await tx.breeder.updateMany({
      where: { userId },
      data: { status: 'SUSPENDED' },
    })

    // 3. Revogar todas as sessoes activas. Sem isto, o utilizador
    // "eliminado" pseudonimizado podia continuar a obter access tokens
    // via refresh (cookie httpOnly ja' enviado pelo browser) ate' 7d.
    // O proximo refresh agora bate em `!user.isActive` e devolve 403,
    // mas eliminar os tokens evita o leak transient e mantem o trilho
    // coerente com `resetPassword` e `suspendUser`.
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    // 4. Audit trail
    await tx.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_DELETED',
        entity: 'user',
        entityId: userId,
        details: 'User requested RGPD account deletion (soft-delete + pseudonymization)',
        ipAddress: req.ip,
      },
    })
  })

  res.status(204).send()
})

/**
 * RGPD Art. 15 (Right of Access) + Art. 20 (Right to Data Portability):
 * devolve um JSON estruturado com TODOS os dados pessoais do utilizador
 * que processamos. Substitui o export anterior em FE que apenas devolvia
 * o user basico (firstName, email, etc.) — claramente insuficiente para
 * compliance.
 *
 * Inclui: perfil, breeder profile (se existe) + photos/breeds/docs/sponsored,
 * services publicados + photos/coverage, threads e mensagens enviadas,
 * reviews escritas e recebidas (criador e servico), reports submetidos,
 * flags submetidas, consent logs, cookie consent logs, audit logs proprios.
 *
 * Exclui: passwordHash, resetToken, emailVerificationToken, refreshTokens
 * — artefactos de auth sem valor para o sujeito e que nao se enquadram
 * em "dados pessoais portaveis" (sao credenciais derivadas).
 *
 * Dados de terceiros (e.g. corpo de mensagens recebidas, autor de reviews
 * recebidas) sao incluidos porque sao tambem dados sobre interaccoes do
 * sujeito; identidades de terceiros sao pseudonimizadas a nivel de campos
 * (apenas id e nome publico, sem email/phone).
 */
export const exportMe = asyncHandler(async (req, res) => {
  const userId = req.user!.userId

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
      avatarUrl: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')

  // Identidades de terceiros — apenas info publica.
  const publicUserFields = {
    id: true,
    firstName: true,
    lastName: true,
    avatarUrl: true,
  }

  const [
    breeder,
    services,
    threadsAsOwner,
    threadsAsBreeder,
    threadsAsServiceProvider,
    sentMessages,
    breederReviewsWritten,
    serviceReviewsWritten,
    breederReviewsReceived,
    serviceReviewsReceived,
    messageReports,
    reviewFlags,
    serviceReviewFlags,
    serviceReports,
    consentLogs,
    cookieConsentLogs,
    auditLogs,
    sponsoredSlotsPaid,
  ] = await Promise.all([
    prisma.breeder.findUnique({
      where: { userId },
      include: {
        district: { select: { id: true, namePt: true } },
        municipality: { select: { id: true, namePt: true } },
        photos: true,
        breeds: { include: { breed: { select: { id: true, namePt: true } } } },
        species: { include: { species: { select: { id: true, namePt: true } } } },
        verificationDocs: true,
      },
    }),
    prisma.service.findMany({
      where: { providerId: userId },
      include: {
        category: { select: { id: true, namePt: true, nameSlug: true } },
        district: { select: { id: true, namePt: true } },
        municipality: { select: { id: true, namePt: true } },
        photos: true,
        coverageAreas: { include: { municipality: { select: { id: true, namePt: true } } } },
      },
    }),
    prisma.thread.findMany({
      where: { ownerId: userId },
      include: {
        breeder: { select: { id: true, businessName: true } },
        service: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.thread.findMany({
      where: { breeder: { userId } },
      include: {
        owner: { select: publicUserFields },
        breeder: { select: { id: true, businessName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.thread.findMany({
      where: { service: { providerId: userId } },
      include: {
        owner: { select: publicUserFields },
        service: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.message.findMany({
      where: { senderId: userId },
      select: {
        id: true,
        threadId: true,
        body: true,
        readAt: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.review.findMany({
      where: { authorId: userId },
      include: { breeder: { select: { id: true, businessName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceReview.findMany({
      where: { authorId: userId },
      include: { service: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.review.findMany({
      where: { breeder: { userId } },
      include: { author: { select: publicUserFields } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceReview.findMany({
      where: { service: { providerId: userId } },
      include: { author: { select: publicUserFields } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.messageReport.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.reviewFlag.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceReviewFlag.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceReport.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.consentLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.cookieConsentLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
    // Apenas accoes proprias (filtrar por userId === self). Excluimos
    // accoes em que o utilizador foi alvo de admin actions (que ficariam
    // em entityId), para evitar leak de detalhes operacionais internos.
    prisma.auditLog.findMany({
      where: { userId },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        details: true,
        createdAt: true,
        // Excluimos ipAddress do export — e' tracked para audit interno
        // mas nao e' "dado pessoal portavel" no sentido RGPD (e o sujeito
        // tipicamente sabe o seu proprio IP). Reduz risco se export for
        // partilhado.
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.sponsoredBreedSlot.findMany({
      where: { paidByUserId: userId },
      select: {
        id: true,
        breedId: true,
        startsAt: true,
        endsAt: true,
        priceCents: true,
        currency: true,
        stripePaymentIntentId: true,
        stripeReceiptUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // Messages recebidas: todas as messages nas threads em que o utilizador
  // participa, exceto as suas (ja' incluidas em sentMessages). Util para o
  // sujeito ter o registo completo das conversas em que participou.
  const threadIds = [
    ...threadsAsOwner.map((t) => t.id),
    ...threadsAsBreeder.map((t) => t.id),
    ...threadsAsServiceProvider.map((t) => t.id),
  ]
  const receivedMessages = threadIds.length
    ? await prisma.message.findMany({
        where: { threadId: { in: threadIds }, NOT: { senderId: userId } },
        include: { sender: { select: publicUserFields } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const payload = {
    exportedAt: new Date().toISOString(),
    exportVersion: '1.0',
    userId,
    profile: user,
    breeder,
    services,
    threads: {
      asOwner: threadsAsOwner,
      asBreeder: threadsAsBreeder,
      asServiceProvider: threadsAsServiceProvider,
    },
    messages: {
      sent: sentMessages,
      received: receivedMessages,
    },
    reviews: {
      writtenAboutBreeders: breederReviewsWritten,
      writtenAboutServices: serviceReviewsWritten,
      receivedAsBreeder: breederReviewsReceived,
      receivedAsServiceProvider: serviceReviewsReceived,
    },
    reports: {
      messageReportsFiled: messageReports,
      serviceReportsFiled: serviceReports,
      breederReviewFlagsFiled: reviewFlags,
      serviceReviewFlagsFiled: serviceReviewFlags,
    },
    consent: {
      consentLogs,
      cookieConsentLogs,
    },
    sponsoredSlotsPaid,
    auditLog: auditLogs,
  }

  // Audit log da accao (RGPD requer rastreabilidade de pedidos de acesso)
  await logAudit({
    userId,
    action: 'USER_DATA_EXPORT',
    entity: 'User',
    entityId: userId,
    details: `RGPD data export requested; included ${threadIds.length} threads, ${sentMessages.length} sent messages, ${receivedMessages.length} received messages, ${services.length} services, ${breederReviewsWritten.length + serviceReviewsWritten.length} reviews written`,
    ipAddress: req.ip,
  })

  // Content-Disposition para encorajar download em vez de inline (alguns
  // browsers fazem render JSON). FE faz Blob download mas headers ajudam
  // em casos de chamada directa.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="patacerta-export-${userId}-${new Date().toISOString().slice(0, 10)}.json"`,
  )
  res.json(payload)
})

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 100)
  const role = req.query.role as string | undefined
  const search = req.query.search as string | undefined

  const where: Record<string, unknown> = {}
  if (role) where.role = role
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ])

  res.json(paginatedResponse(users, total, page, limit))
})

export const getUserById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...USER_SELECT,
      breeder: { select: { id: true, businessName: true, status: true, nif: true } },
    },
  })
  if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')
  res.json(user)
})

export const changeUserRole = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  // Body shape is enforced by the changeUserRoleSchema Zod validator on the
  // router; the enum mirrors UserRole exactly so we never have to maintain
  // a duplicate allow-list here.
  const { role } = req.body as ChangeUserRoleInput

  if (id === req.user!.userId)
    throw new AppError(400, 'Não pode alterar o seu próprio papel', 'SELF_ROLE_CHANGE')

  // Carregar o role actual antes da update para audit log e para
  // possiveis checks adicionais (e.g., despromocao de outro admin).
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, isActive: true, suspendedAt: true },
  })
  if (!target) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')

  // Bloquear alteracoes de papel sobre utilizadores suspensos/inactivos.
  // Caso contrario um admin podia silenciosamente promover um utilizador
  // suspenso a ADMIN e este, ao ser reactivado, acordaria com permissoes
  // elevadas. Forcamos reactivacao explicita antes da alteracao de papel.
  if (!target.isActive || target.suspendedAt) {
    throw new AppError(
      400,
      'Utilizador suspenso ou inactivo — reactive antes de alterar o papel',
      'USER_NOT_ACTIVE',
    )
  }

  // Guard: impedir despromover o último ADMIN activo. Sem este check,
  // um admin podia retirar o papel ao único colega ADMIN restante e
  // depois ficar bloqueado por SELF_ROLE_CHANGE no proprio.
  if (target.role === 'ADMIN' && role !== 'ADMIN') {
    const activeAdminCount = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    })
    if (activeAdminCount <= 1) {
      throw new AppError(
        400,
        'Não é possível remover o papel ADMIN: é o último administrador activo.',
        'LAST_ACTIVE_ADMIN',
      )
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: USER_SELECT,
  })

  // Audit log e CRITICO aqui: privilege escalation/de-escalation deve
  // ter sempre rasto.
  await logAudit({
    userId: req.user!.userId,
    action: 'CHANGE_USER_ROLE',
    entity: 'User',
    entityId: id,
    details: `Role changed for ${target.email}: ${target.role} -> ${role}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

// ---------------------------------------------------------------------------
// Avatar upload — POST /users/me/avatar (multipart "file") + DELETE
// ---------------------------------------------------------------------------
//
// Avatar e' uma imagem publica, redimensionada server-side para 512x512
// JPEG (mozjpeg q85, EXIF orientation respeitado). Substitui qualquer
// avatar anterior, apagando o objecto antigo do MinIO em best-effort
// (sem falhar o request se a remocao falhar — pior caso e' orfa no
// bucket que cron pode varrer).
//
// Limite 2MB no upload bruto; sharp re-encodifica, eliminando metadados.
// Magic-bytes validados antes do sharp.

const AVATAR_MAX_DIMENSION = 512
const AVATAR_JPEG_QUALITY = 85
const AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(
        new AppError(
          400,
          'Tipo de ficheiro não suportado. Use JPG, PNG ou WebP.',
          'INVALID_FILE_TYPE',
        ) as unknown as Error,
      )
    }
  },
}).single('file')

function runAvatarMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    avatarUpload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return reject(new AppError(400, 'Avatar pode ter no máximo 2MB', 'FILE_TOO_LARGE'))
        }
        return reject(err)
      }
      resolve()
    })
  })
}

/**
 * Extrai o objectName a partir de uma URL no formato `/{bucket}/{object}`
 * (devolvido por `uploadFile`). Retorna `null` se a URL nao seguir esse
 * padrao (e.g. avatar externo pre-existente). Usado para apagar o avatar
 * antigo do MinIO ao substituir.
 */
function extractPublicObjectName(url: string): string | null {
  if (!url || !url.startsWith('/')) return null
  const m = url.match(/^\/[^/]+\/(.+)$/)
  return m ? m[1] : null
}

export const uploadMyAvatar = asyncHandler(async (req, res) => {
  await runAvatarMulter(req, res)

  if (!req.file) throw new AppError(400, 'Nenhum ficheiro enviado', 'NO_FILE')

  // Magic-bytes: header mimetype e' client-supplied. Garantir que e' uma
  // imagem real antes de a passar ao sharp (que aceitaria PDFs como input
  // e silenciosamente erraria; melhor erro claro 400).
  assertFileKind(req.file.buffer, ['image/jpeg', 'image/png', 'image/webp'])

  const userId = req.user!.userId

  const buffer = await (await createSafeSharp(req.file.buffer))
    .rotate()
    .resize({
      width: AVATAR_MAX_DIMENSION,
      height: AVATAR_MAX_DIMENSION,
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: AVATAR_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()

  const objectName = `avatars/${userId}/${randomUUID()}.jpg`
  const url = await uploadFile(objectName, buffer, 'image/jpeg')

  // Apaga avatar anterior em best-effort. Lemos primeiro o valor actual
  // (e nao o usamos como condicao optimistic) — concorrencia de duas
  // uploads simultaneos do mesmo user vai apenas deixar o mais antigo
  // orfa, aceitavel.
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: url },
    select: USER_SELECT,
  })

  if (previous?.avatarUrl) {
    const oldObject = extractPublicObjectName(previous.avatarUrl)
    if (oldObject) {
      await deleteFile(oldObject).catch(() => {
        // best-effort: orfa no bucket nao bloqueia o request
      })
    }
  }

  await logAudit({
    userId,
    action: 'USER_AVATAR_UPLOADED',
    entity: 'User',
    entityId: userId,
    ipAddress: req.ip,
  })

  res.status(201).json(updated)
})

export const deleteMyAvatar = asyncHandler(async (req, res) => {
  const userId = req.user!.userId

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })
  if (!current?.avatarUrl) {
    throw new AppError(404, 'Não tem avatar definido', 'AVATAR_NOT_FOUND')
  }

  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  })

  const oldObject = extractPublicObjectName(current.avatarUrl)
  if (oldObject) {
    await deleteFile(oldObject).catch(() => {
      // best-effort
    })
  }

  await logAudit({
    userId,
    action: 'USER_AVATAR_DELETED',
    entity: 'User',
    entityId: userId,
    ipAddress: req.ip,
  })

  res.status(204).send()
})
