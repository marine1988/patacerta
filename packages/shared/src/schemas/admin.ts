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
