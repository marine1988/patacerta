import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import { forgotPasswordEmailRateLimit } from '../../middleware/rate-limit.js'
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

authRouter.post('/register', validate(registerSchema), register)
authRouter.post('/login', validate(loginSchema), login)
authRouter.post('/refresh', validate(refreshTokenSchema), refresh)
authRouter.post('/logout', validate(logoutSchema), logout)
authRouter.post('/verify-email', validate(verifyEmailSchema), verifyEmail)
authRouter.post('/resend-verification', validate(resendVerificationSchema), resendVerification)
authRouter.post(
  '/forgot-password',
  forgotPasswordEmailRateLimit,
  validate(forgotPasswordSchema),
  forgotPassword,
)
authRouter.post('/reset-password', validate(resetPasswordSchema), resetPassword)
