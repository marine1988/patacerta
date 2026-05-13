import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, parsePagination, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import { uploadFile, deleteFile } from '../../lib/minio.js'
import { assertFileKind } from '../../lib/file-validation.js'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import sharp from 'sharp'
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

  if (newPassword) {
    if (!currentPassword)
      throw new AppError(400, 'Palavra-passe atual é obrigatória', 'MISSING_CURRENT_PASSWORD')

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new AppError(400, 'Palavra-passe atual incorreta', 'INVALID_CURRENT_PASSWORD')

    updateData.passwordHash = await bcrypt.hash(newPassword, 12)
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.userId },
    data: updateData,
    select: USER_SELECT,
  })

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

    // 3. Audit trail
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
    select: { id: true, email: true, role: true },
  })
  if (!target) throw new AppError(404, 'Utilizador não encontrado', 'USER_NOT_FOUND')

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

  const buffer = await sharp(req.file.buffer)
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
