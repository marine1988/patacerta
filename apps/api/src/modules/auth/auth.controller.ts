import { prisma } from '../../lib/prisma.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler } from '../../lib/helpers.js'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
  ResendVerificationInput,
} from '@patacerta/shared'

const EMAIL_VERIFICATION_EXPIRY_HOURS = 24
const RESET_TOKEN_EXPIRY_HOURS = 1

function buildVerificationUrl(token: string): string {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173'
  return `${base}/verificar-email?token=${token}`
}

function generateVerificationToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000)
  return { token, expiresAt }
}

export const register = asyncHandler(async (req, res) => {
  const data = req.body as RegisterInput
  const email = data.email.toLowerCase().trim()
  const passwordHash = await bcrypt.hash(data.password, 12)
  const { token: verificationToken, expiresAt: verificationExpiresAt } = generateVerificationToken()

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
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Este email já está registado', 'EMAIL_EXISTS')
    }
    throw err
  }

  // MVP: log verification URL to console (no SMTP yet)
  const verificationUrl = buildVerificationUrl(verificationToken)
  console.log(`[EmailVerification] Link for ${user.email}: ${verificationUrl}`)

  res.status(201).json({
    message:
      'Conta criada. Verifique o seu email para ativar a conta antes de iniciar sessão.',
    email: user.email,
  })
})

export const login = asyncHandler(async (req, res) => {
  const data = req.body as LoginInput
  const email = data.email.toLowerCase().trim()

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new AppError(401, 'Email ou palavra-passe incorretos', 'INVALID_CREDENTIALS')
  if (!user.isActive) throw new AppError(403, 'Conta suspensa — contacte o suporte', 'ACCOUNT_SUSPENDED')

  const valid = await bcrypt.compare(data.password, user.passwordHash)
  if (!valid) throw new AppError(401, 'Email ou palavra-passe incorretos', 'INVALID_CREDENTIALS')

  if (!user.emailVerified) {
    throw new AppError(
      403,
      'Verifique o seu email antes de iniciar sessão.',
      'EMAIL_NOT_VERIFIED',
    )
  }

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

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body as VerifyEmailInput

  const user = await prisma.user.findUnique({ where: { emailVerificationToken: token } })
  if (!user) throw new AppError(400, 'Token inválido ou já utilizado', 'INVALID_VERIFICATION_TOKEN')
  if (user.emailVerified) {
    res.json({ message: 'Email já estava verificado. Pode iniciar sessão.' })
    return
  }
  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    throw new AppError(
      400,
      'Token expirado — solicite um novo email de verificação',
      'EXPIRED_VERIFICATION_TOKEN',
    )
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
  })

  res.json({ message: 'Email verificado com sucesso. Pode agora iniciar sessão.' })
})

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body as ResendVerificationInput

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  })

  // Always 200 to avoid email enumeration
  if (!user || !user.isActive || user.emailVerified) {
    res.json({ message: 'Se o email existir e não estiver verificado, receberá um novo link.' })
    return
  }

  const { token, expiresAt } = generateVerificationToken()
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationToken: token, emailVerificationExpiresAt: expiresAt },
  })

  const verificationUrl = buildVerificationUrl(token)
  console.log(`[EmailVerification] Resent link for ${user.email}: ${verificationUrl}`)

  res.json({ message: 'Se o email existir e não estiver verificado, receberá um novo link.' })
})

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
