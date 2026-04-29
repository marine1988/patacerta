import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import {
  forgotPasswordEmailRateLimit,
  loginRateLimit,
  registerRateLimit,
  refreshRateLimit,
  passwordResetRateLimit,
} from '../../middleware/rate-limit.js'
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from '@patacerta/shared'
import { z } from 'zod'
import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} from './auth.controller.js'

export const authRouter = Router()

// Logout accepts an optional refresh token so the client can always call it.
// When present, the whole rotation chain is revoked.
const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
})

// Cada endpoint tem o seu proprio bucket de rate-limit (ver rate-limit.ts).
// Antes /api/auth/* partilhava um unico balde, e brute-force ao login podia
// bloquear refresh tokens legitimos.
authRouter.post('/register', registerRateLimit, validate(registerSchema), register)
authRouter.post('/login', loginRateLimit, validate(loginSchema), login)
authRouter.post('/refresh', refreshRateLimit, validate(refreshTokenSchema), refresh)
authRouter.post('/logout', validate(logoutSchema), logout)
authRouter.post('/verify-email', passwordResetRateLimit, validate(verifyEmailSchema), verifyEmail)
authRouter.post(
  '/resend-verification',
  passwordResetRateLimit,
  validate(resendVerificationSchema),
  resendVerification,
)
authRouter.post(
  '/forgot-password',
  forgotPasswordEmailRateLimit,
  validate(forgotPasswordSchema),
  forgotPassword,
)
authRouter.post(
  '/reset-password',
  passwordResetRateLimit,
  validate(resetPasswordSchema),
  resetPassword,
)
