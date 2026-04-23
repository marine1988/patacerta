// ============================================
// PataCerta — Zod Schemas (Breeder)
// ============================================

import { z } from 'zod'
import { DocType } from '../enums.js'

/** Portuguese NIF validation (9 digits, check digit algorithm) */
export function isValidNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false

  const digits = nif.split('').map(Number)
  const checkDigit = digits[8]

  let sum = 0
  for (let i = 0; i < 8; i++) {
    sum += digits[i] * (9 - i)
  }

  const remainder = sum % 11
  const expected = remainder < 2 ? 0 : 11 - remainder

  return checkDigit === expected
}

export const nifSchema = z
  .string()
  .length(9, 'NIF deve ter 9 dígitos')
  .regex(/^\d{9}$/, 'NIF deve conter apenas dígitos')
  .refine(isValidNif, 'NIF inválido')

/**
 * DGAV number validation.
 * DGAV doesn't publish a formal public format, but issued numbers are
 * alphanumeric identifiers typically 6-20 chars. We accept:
 *   - Optional "PT" or "DGAV-" prefix
 *   - Digits, letters, hyphens, slashes
 *   - 6-20 chars after normalization
 */
export const dgavNumberSchema = z
  .string()
  .trim()
  .min(6, 'Número DGAV deve ter pelo menos 6 caracteres')
  .max(50, 'Número DGAV demasiado longo')
  .regex(/^[A-Za-z0-9\-\/]+$/, 'Número DGAV só pode conter letras, dígitos, hífens e barras')

export const breederProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  nif: nifSchema,
  dgavNumber: dgavNumberSchema,
  description: z.string().trim().max(2000).optional(),
  districtId: z.number().int().positive(),
  municipalityId: z.number().int().positive(),
  speciesIds: z.array(z.number().int().positive()).min(1, 'Selecione pelo menos uma espécie'),
  website: z.string().url().max(255).optional(),
  phone: z
    .string()
    .regex(/^\+351\s?\d{3}\s?\d{3}\s?\d{3}$/, 'Formato: +351 XXX XXX XXX')
    .optional(),
})

export const updateBreederProfileSchema = breederProfileSchema.partial()

export const verificationDocUploadSchema = z.object({
  docType: z.nativeEnum(DocType),
})

export const verificationReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().max(500).optional(),
})

export type BreederProfileInput = z.infer<typeof breederProfileSchema>
export type UpdateBreederProfileInput = z.infer<typeof updateBreederProfileSchema>
export type VerificationDocUploadInput = z.infer<typeof verificationDocUploadSchema>
export type VerificationReviewInput = z.infer<typeof verificationReviewSchema>
