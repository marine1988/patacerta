import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import { loginSchema, registerSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema } from '@patacerta/shared'
import { register, login, refresh, forgotPassword, resetPassword } from './auth.controller.js'

export const authRouter = Router()

authRouter.post('/register', validate(registerSchema), register)
authRouter.post('/login', validate(loginSchema), login)
authRouter.post('/refresh', validate(refreshTokenSchema), refresh)
authRouter.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword)
authRouter.post('/reset-password', validate(resetPasswordSchema), resetPassword)
