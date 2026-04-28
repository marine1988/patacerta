import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, parsePagination, paginatedResponse } from '../../lib/helpers.js'
import bcrypt from 'bcryptjs'
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

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: USER_SELECT,
  })

  res.json(updated)
})
