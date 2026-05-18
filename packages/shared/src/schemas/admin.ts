// ============================================
// PataCerta — Zod Schemas (Admin)
// ============================================
//
// Schemas for admin-only mutations. Keeping these centralised in shared/
// guarantees the API and any admin UI agree on the contract and that no
// admin endpoint accepts unvalidated payloads.

import { z } from 'zod'
import { paginationQuerySchema } from './common.js'

// PATCH /api/users/:id/role — change a user's role.
// Mirrors the UserRole enum exactly so we can never accidentally promote
// to a role the backend does not recognise.
export const changeUserRoleSchema = z.object({
  role: z.enum(['OWNER', 'BREEDER', 'SERVICE_PROVIDER', 'ADMIN']),
})
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>

// PATCH /api/verification/:docId/review — admin reviews a verification doc.
// notes is optional free-form context shown back to the breeder, mas para
// REJECTED é obrigatório com pelo menos 5 caracteres (o criador precisa
// de saber o que corrigir; rejeições silenciosas degradam a UX).
export const reviewVerificationDocSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (v) => v.status !== 'REJECTED' || (typeof v.notes === 'string' && v.notes.trim().length >= 5),
    {
      message: 'Para rejeitar, indique uma nota com pelo menos 5 caracteres.',
      path: ['notes'],
    },
  )
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

// ──────────────────────────────────────────────────────────────────────
// Query schemas para endpoints de listagem admin
// ──────────────────────────────────────────────────────────────────────
//
// Todos extendem paginationQuerySchema e usam `.coerce` quando necessário
// (query params chegam como string). Validação centralizada aqui evita
// duplicação inline nos controllers e garante respostas 400 consistentes
// via o middleware `validate` + ZodError handler.

// GET /api/admin/users — listagem com filtro opcional por role e
// pesquisa livre (`q`) sobre nome/email/id.
export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['OWNER', 'BREEDER', 'SERVICE_PROVIDER', 'ADMIN']).optional(),
  q: z.string().trim().min(1).max(200).optional(),
})
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>

// GET /api/admin/breeders — filtro opcional por estado do criador.
export const listBreedersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED']).optional(),
})
export type ListBreedersQuery = z.infer<typeof listBreedersQuerySchema>

// GET /api/admin/services — filtros de moderação (status + pesquisa).
export const listAllServicesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED']).optional(),
  q: z.string().trim().min(1).max(200).optional(),
})
export type ListAllServicesQuery = z.infer<typeof listAllServicesQuerySchema>

// GET /api/admin/reviews/flagged — tipo opcional (breeder/service/all),
// default 'breeder' mantém compat com call sites legacy.
export const flaggedReviewsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['breeder', 'service', 'all']).default('breeder'),
})
export type FlaggedReviewsQuery = z.infer<typeof flaggedReviewsQuerySchema>

// GET /api/admin/message-reports e /api/admin/service-reports — mesmo
// shape (estado da denúncia + paginação). Default 'PENDING' alinha com
// fluxo de moderação (primeiro o que está por tratar).
export const listReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'RESOLVED', 'DISMISSED']).default('PENDING'),
})
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>

// GET /api/admin/audit-logs — filtros largos (action/entity são `contains`
// case-insensitive no controller). Datas aceitam `YYYY-MM-DD` (input nativo
// type="date") ou ISO 8601 completo; o controller já trata `dateTo` como
// fim-do-dia.
const auditDateSchema = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    'Data inválida (use YYYY-MM-DD)',
  )
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Data inválida')

export const auditLogsQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().min(1).max(100).optional(),
  entity: z.string().trim().min(1).max(100).optional(),
  userId: z.coerce.number().int().positive().optional(),
  dateFrom: auditDateSchema.optional(),
  dateTo: auditDateSchema.optional(),
})
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>
