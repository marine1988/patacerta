// ============================================
// PataCerta — Zod Schemas (Auth)
// ============================================

import { z } from 'zod'
import { UserRole } from '../enums.js'

// I-06: .trim() on all user-facing string fields
export const emailSchema = z.string().trim().email('Email inválido').max(255)

export const passwordSchema = z
  .string()
  .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres')
  .max(128)
  .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Deve conter pelo menos um número')

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.nativeEnum(UserRole).refine((v) => v !== UserRole.ADMIN, {
    message: 'Não é possível registar como administrador',
  }),
  phone: z
    .string()
    .regex(/^\+351\s?\d{3}\s?\d{3}\s?\d{3}$/, 'Formato: +351 XXX XXX XXX')
    .optional(),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

// B-12: Schema for user profile update (PATCH /users/me)
export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z
    .string()
    .regex(/^\+351\s?\d{3}\s?\d{3}\s?\d{3}$/, 'Formato: +351 XXX XXX XXX')
    .optional()
    .nullable(),
  currentPassword: z.string().min(1).optional(),
  newPassword: passwordSchema.optional(),
}).refine(
  (data) => {
    // If newPassword is provided, currentPassword must be too
    if (data.newPassword && !data.currentPassword) return false
    return true
  },
  { message: 'Palavra-passe atual é obrigatória para alterar a palavra-passe', path: ['currentPassword'] },
)

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>

// Password reset
export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  password: passwordSchema,
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
