import { prisma } from '../../lib/prisma.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler } from '../../lib/helpers.js'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from '@patacerta/shared'

export const register = asyncHandler(async (req, res) => {
  const data = req.body as RegisterInput
  const email = data.email.toLowerCase().trim()
  const passwordHash = await bcrypt.hash(data.password, 12)

  let user
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        phone: data.phone,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Este email já está registado', 'EMAIL_EXISTS')
    }
    throw err
  }

  const payload = { userId: user.id, email: user.email, role: user.role }
  const accessToken = signAccessToken(payload)
  const refreshToken = signRefreshToken(payload)

  res.status(201).json({ user, accessToken, refreshToken })
})

export const login = asyncHandler(async (req, res) => {
  const data = req.body as LoginInput
  const email = data.email.toLowerCase().trim()

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new AppError(401, 'Email ou palavra-passe incorretos', 'INVALID_CREDENTIALS')
  if (!user.isActive) throw new AppError(403, 'Conta suspensa — contacte o suporte', 'ACCOUNT_SUSPENDED')

  const valid = await bcrypt.compare(data.password, user.passwordHash)
  if (!valid) throw new AppError(401, 'Email ou palavra-passe incorretos', 'INVALID_CREDENTIALS')

  const payload = { userId: user.id, email: user.email, role: user.role }
  const accessToken = signAccessToken(payload)
  const refreshToken = signRefreshToken(payload)

  res.json({
    user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    accessToken,
    refreshToken,
  })
})

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string }
  const decoded = verifyRefreshToken(refreshToken)
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
  if (!user) throw new AppError(401, 'Utilizador não encontrado', 'USER_NOT_FOUND')
  if (!user.isActive) throw new AppError(403, 'Conta suspensa — contacte o suporte', 'ACCOUNT_SUSPENDED')

  const payload = { userId: user.id, email: user.email, role: user.role }
  res.json({ accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload) })
})

const RESET_TOKEN_EXPIRY_HOURS = 1

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as ForgotPasswordInput

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })

  // Always return 200 to avoid email enumeration
  if (!user || !user.isActive) {
    res.json({ message: 'Se o email existir, receberá instruções para repor a palavra-passe.' })
    return
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiresAt: expiresAt },
  })

  // MVP: Log to console — in production, send via SMTP
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/recuperar-palavra-passe?token=${token}`
  console.log(`[PasswordReset] Reset link for ${user.email}: ${resetUrl}`)

  res.json({ message: 'Se o email existir, receberá instruções para repor a palavra-passe.' })
})

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body as ResetPasswordInput

  const user = await prisma.user.findUnique({ where: { resetToken: token } })
  if (!user) throw new AppError(400, 'Token inválido ou expirado', 'INVALID_RESET_TOKEN')
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new AppError(400, 'Token expirado — solicite um novo', 'EXPIRED_RESET_TOKEN')
  }
  if (!user.isActive) throw new AppError(403, 'Conta suspensa — contacte o suporte', 'ACCOUNT_SUSPENDED')

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
  })

  res.json({ message: 'Palavra-passe atualizada com sucesso. Pode agora iniciar sessão.' })
})
