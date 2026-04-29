import { prisma } from '../../lib/prisma.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../../lib/email.js'
import { maskEmail } from '../../lib/redact.js'
import { isHttps } from '../../lib/env.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler } from '../../lib/helpers.js'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import {
  CONSENT_TYPE,
  TERMS_VERSION,
  type RegisterInput,
  type LoginInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
  type ResendVerificationInput,
} from '@patacerta/shared'

const EMAIL_VERIFICATION_EXPIRY_HOURS = 24
const RESET_TOKEN_EXPIRY_HOURS = 1
// Must mirror JWT_REFRESH_EXPIRES_IN default in lib/jwt.ts. We keep an
// independent millisecond constant here because Prisma needs an absolute
// expiresAt and parsing the JWT lib's "7d" string would be brittle.
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

const REFRESH_COOKIE_NAME = 'refresh_token'
// Cookie path e propositadamente restrito a /api/auth para que o token
// nunca seja enviado em chamadas a outros endpoints (defesa contra CSRF
// por confusao de scope). O FE chama /api/auth/refresh e /api/auth/logout
// — ambos sob este path.
const REFRESH_COOKIE_PATH = '/api/auth'

/**
 * Set the refresh-token cookie. httpOnly+SameSite=strict so JS cannot read
 * it and CSRF cannot trigger cross-site refreshes. Secure flag liga-se em
 * qualquer ambiente HTTPS (production + stage); fica off so' em dev (http).
 */
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  })
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  })
}

/**
 * Read refresh token from cookie first, then fall back to body for back-compat
 * during the FE rollout. Once the FE no longer sends the body field, the
 * fallback can be removed and the body schema tightened.
 */
function readRefreshToken(req: Request): string | undefined {
  const fromCookie = (req.cookies as { refresh_token?: string } | undefined)?.refresh_token
  if (fromCookie) return fromCookie
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken
  return fromBody
}

/**
 * Hash one-time tokens (email verification, password reset) before storing in DB.
 * The raw token is sent to the user's email; only the hash lives at rest, so a DB
 * leak does not allow account takeover. We use SHA-256 (not bcrypt) because the
 * tokens are 256-bit random and short-lived — collision/preimage resistance is
 * sufficient and verification needs to be O(1) by hash lookup.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * When true, registration auto-verifies the user and login does not require
 * email verification. Controlled by AUTH_SKIP_EMAIL_VERIFICATION env var.
 * MUST remain false/unset in production.
 */
function skipEmailVerification(): boolean {
  const v = process.env.AUTH_SKIP_EMAIL_VERIFICATION
  return v === '1' || v === 'true' || v === 'TRUE'
}

function buildVerificationUrl(token: string): string {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173'
  return `${base}/verificar-email?token=${token}`
}

function generateVerificationToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000)
  return { token, tokenHash, expiresAt }
}

/**
 * Sign a refresh JWT for `payload` and persist its hash so we can rotate /
 * revoke it later. The plaintext token is returned to the client; only the
 * hash lives at rest. `replacedById` and `parentId` let us walk the rotation
 * chain when we need to detect token reuse and revoke siblings.
 */
async function issueRefreshToken(
  payload: { userId: number; email: string; role: string },
  req: Request,
  parentId: number | null = null,
): Promise<string> {
  const token = signRefreshToken(payload)
  const stored = await prisma.refreshToken.create({
    data: {
      userId: payload.userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
    },
    select: { id: true },
  })
  if (parentId !== null) {
    await prisma.refreshToken.update({
      where: { id: parentId },
      data: { replacedById: stored.id },
    })
  }
  return token
}

/**
 * Mark `tokenId` and every token that descended from it (via `replacedById`)
 * as revoked. Used both on legitimate logout and as the response to detected
 * token reuse — if a token we already retired is presented again, somebody
 * still holds it and we must invalidate the whole chain.
 */
async function revokeRefreshChain(tokenId: number): Promise<void> {
  const visited = new Set<number>()
  const stack = [tokenId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    const node = await prisma.refreshToken.findUnique({
      where: { id: current },
      select: { replacedById: true },
    })
    if (node?.replacedById) stack.push(node.replacedById)
  }
  if (visited.size === 0) return
  await prisma.refreshToken.updateMany({
    where: { id: { in: [...visited] }, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export const register = asyncHandler(async (req, res) => {
  const data = req.body as RegisterInput
  const email = data.email.toLowerCase().trim()
  const passwordHash = await bcrypt.hash(data.password, 12)
  const skip = skipEmailVerification()
  const {
    token: verificationToken,
    tokenHash: verificationTokenHash,
    expiresAt: verificationExpiresAt,
  } = generateVerificationToken()
  const ipAddress = req.ip ?? null
  const userAgent = req.headers['user-agent']?.slice(0, 500) ?? null

  let user
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          // Registo simplificado: todos comecam como OWNER. Role
          // auto-promove ao criar perfil de criador (BREEDER) ou um
          // servico (SERVICE_PROVIDER).
          role: 'OWNER',
          phone: data.phone,
          emailVerified: skip,
          emailVerificationToken: skip ? null : verificationTokenHash,
          emailVerificationExpiresAt: skip ? null : verificationExpiresAt,
        },
        select: { id: true, email: true, role: true, firstName: true, lastName: true },
      })

      // RGPD: persist explicit consent for Terms + Privacy.
      // consentType stored as `<TYPE>:<version>` so we can prove which text was accepted.
      await tx.consentLog.createMany({
        data: [
          {
            userId: created.id,
            consentType: `${CONSENT_TYPE.TERMS}:${TERMS_VERSION}`,
            granted: true,
            ipAddress,
            userAgent,
          },
          {
            userId: created.id,
            consentType: `${CONSENT_TYPE.PRIVACY}:${TERMS_VERSION}`,
            granted: true,
            ipAddress,
            userAgent,
          },
        ],
      })

      return created
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Este email já está registado', 'EMAIL_EXISTS')
    }
    throw err
  }

  if (skip) {
    console.log(
      `[EmailVerification] SKIPPED for ${maskEmail(user.email)} (AUTH_SKIP_EMAIL_VERIFICATION enabled)`,
    )
    res.status(201).json({
      message: 'Conta criada. Pode iniciar sessão.',
      email: user.email,
    })
    return
  }

  const verificationUrl = buildVerificationUrl(verificationToken)
  await sendVerificationEmail(user.email, verificationUrl)

  res.status(201).json({
    message: 'Conta criada. Verifique o seu email para ativar a conta antes de iniciar sessão.',
    email: user.email,
  })
})

export const login = asyncHandler(async (req, res) => {
  const data = req.body as LoginInput
  const email = data.email.toLowerCase().trim()

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new AppError(401, 'Email ou palavra-passe incorretos', 'INVALID_CREDENTIALS')
  if (!user.isActive)
    throw new AppError(403, 'Conta suspensa — contacte o suporte', 'ACCOUNT_SUSPENDED')

  const valid = await bcrypt.compare(data.password, user.passwordHash)
  if (!valid) throw new AppError(401, 'Email ou palavra-passe incorretos', 'INVALID_CREDENTIALS')

  if (!user.emailVerified && !skipEmailVerification()) {
    throw new AppError(403, 'Verifique o seu email antes de iniciar sessão.', 'EMAIL_NOT_VERIFIED')
  }

  const payload = { userId: user.id, email: user.email, role: user.role }
  const accessToken = signAccessToken(payload)
  const refreshToken = await issueRefreshToken(payload, req)
  setRefreshCookie(res, refreshToken)

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    accessToken,
  })
})

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req)
  if (!refreshToken) {
    throw new AppError(401, 'Refresh token em falta', 'MISSING_REFRESH_TOKEN')
  }
  // First, verify the JWT signature/expiry. A forged or tampered token never
  // even reaches the DB lookup.
  const decoded = verifyRefreshToken(refreshToken)

  // Then look up the matching DB record so we can enforce rotation: a
  // legitimate refresh token must exist, must not be revoked, and must not
  // have expired (the JWT exp is the upper bound; the DB row may be revoked
  // earlier).
  const tokenHashValue = hashToken(refreshToken)
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: tokenHashValue } })

  if (!stored) {
    // The signature checked out but we have no record. Treat as a forgery
    // attempt; the user will have to re-authenticate.
    clearRefreshCookie(res)
    throw new AppError(401, 'Refresh token inválido', 'INVALID_REFRESH_TOKEN')
  }

  if (stored.revokedAt) {
    // Reuse detection: somebody is presenting a token we already rotated
    // away from. Either an attacker captured the old token or the legitimate
    // client cached it past rotation. Either way, revoke the whole chain so
    // both parties have to re-authenticate.
    await revokeRefreshChain(stored.id)
    clearRefreshCookie(res)
    throw new AppError(401, 'Refresh token reutilizado — sessão revogada', 'REFRESH_TOKEN_REUSED')
  }

  if (stored.expiresAt < new Date()) {
    clearRefreshCookie(res)
    throw new AppError(401, 'Refresh token expirado', 'EXPIRED_REFRESH_TOKEN')
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
  if (!user) throw new AppError(401, 'Utilizador não encontrado', 'USER_NOT_FOUND')
  if (!user.isActive)
    throw new AppError(403, 'Conta suspensa — contacte o suporte', 'ACCOUNT_SUSPENDED')

  const payload = { userId: user.id, email: user.email, role: user.role }

  // Rotate: revoke this token, issue a fresh one, link them so reuse of the
  // old token is detectable.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  })
  const newRefresh = await issueRefreshToken(payload, req, stored.id)
  setRefreshCookie(res, newRefresh)

  res.json({ accessToken: signAccessToken(payload) })
})

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req)
  // We accept logout without a token as a no-op so the client can always
  // call this endpoint without worrying about state. With a token, we
  // revoke the whole chain so any leaked sibling is invalidated too.
  if (refreshToken) {
    try {
      verifyRefreshToken(refreshToken)
    } catch {
      // Tampered or expired tokens are not worth blocking logout on.
    }
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: { id: true },
    })
    if (stored) await revokeRefreshChain(stored.id)
  }
  clearRefreshCookie(res)
  res.status(204).send()
})

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body as VerifyEmailInput
  const tokenHash = hashToken(token)

  const user = await prisma.user.findUnique({ where: { emailVerificationToken: tokenHash } })
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

  const { token, tokenHash, expiresAt } = generateVerificationToken()
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationToken: tokenHash, emailVerificationExpiresAt: expiresAt },
  })

  const verificationUrl = buildVerificationUrl(token)
  await sendVerificationEmail(user.email, verificationUrl)

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
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: tokenHash, resetTokenExpiresAt: expiresAt },
  })

  // Send via SMTP (no-op log fallback when SMTP not configured)
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/recuperar-palavra-passe?token=${token}`
  await sendPasswordResetEmail(user.email, resetUrl)

  res.json({ message: 'Se o email existir, receberá instruções para repor a palavra-passe.' })
})

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body as ResetPasswordInput
  const tokenHash = hashToken(token)

  const user = await prisma.user.findUnique({ where: { resetToken: tokenHash } })
  if (!user) throw new AppError(400, 'Token inválido ou expirado', 'INVALID_RESET_TOKEN')
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new AppError(400, 'Token expirado — solicite um novo', 'EXPIRED_RESET_TOKEN')
  }
  if (!user.isActive)
    throw new AppError(403, 'Conta suspensa — contacte o suporte', 'ACCOUNT_SUSPENDED')

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
  })

  res.json({ message: 'Palavra-passe atualizada com sucesso. Pode agora iniciar sessão.' })
})
