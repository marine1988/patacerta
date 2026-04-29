// ============================================
// PataCerta — Zod Schemas (Admin)
// ============================================
//
// Schemas for admin-only mutations. Keeping these centralised in shared/
// guarantees the API and any admin UI agree on the contract and that no
// admin endpoint accepts unvalidated payloads.

import { z } from 'zod'

// PATCH /api/users/:id/role — change a user's role.
// Mirrors the UserRole enum exactly so we can never accidentally promote
// to a role the backend does not recognise.
export const changeUserRoleSchema = z.object({
  role: z.enum(['OWNER', 'BREEDER', 'SERVICE_PROVIDER', 'ADMIN']),
})
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>

// PATCH /api/verification/:docId/review — admin reviews a verification doc.
// notes is optional free-form context shown back to the breeder.
export const reviewVerificationDocSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().trim().max(2000).optional(),
})
export type ReviewVerificationDocInput = z.infer<typeof reviewVerificationDocSchema>

// Admin suspensions — both for users and breeders. Reason is mandatory and
// surfaced in the audit log; the affected party may also see it (FE decision).
export const suspendBreederSchema = z.object({
  reason: z.string().trim().min(15, 'Indique um motivo com pelo menos 15 caracteres').max(500),
})
export type SuspendBreederInput = z.infer<typeof suspendBreederSchema>

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(15, 'Indique um motivo com pelo menos 15 caracteres').max(500),
})
export type SuspendUserInput = z.infer<typeof suspendUserSchema>

// PATCH /api/admin/breeders/:id/featured  e  /api/admin/services/:id/featured.
// Aceita um de tres formatos exclusivos:
//   { until: null }           — remove a promocao
//   { until: '2026-12-31T...' } — define data ISO absoluta
//   { days: 30 }                — define rolling N dias a partir de agora (1..365)
//
// Refine garante que pelo menos um dos dois e' dado e que nao sao
// fornecidos em simultaneo (evita ambiguidade).
const FEATURED_DAYS_MAX = 365
export const featuredPayloadSchema = z
  .object({
    until: z.union([z.string().datetime({ message: 'Data ISO invalida' }), z.null()]).optional(),
    days: z.number().int().positive().max(FEATURED_DAYS_MAX).optional(),
  })
  .refine((v) => (v.until !== undefined) !== (v.days !== undefined), {
    message: 'Forneca { until } ou { days } (mutuamente exclusivos)',
  })
export type FeaturedPayloadInput = z.infer<typeof featuredPayloadSchema>
