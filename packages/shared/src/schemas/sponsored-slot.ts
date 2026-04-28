// ============================================
// PataCerta — Zod Schemas (Sponsored Slots)
// ============================================
//
// Slots patrocinados de criadores em raças do simulador.
// Endpoints admin (CRUD) + endpoint público de tracking de cliques.

import { z } from 'zod'

// ─── Admin: criar / actualizar ───────────────────────────────────────

export const createSponsoredSlotSchema = z
  .object({
    breederId: z.coerce.number().int().positive(),
    breedId: z.coerce.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.endsAt.getTime() > d.startsAt.getTime(), {
    message: 'A data de fim tem de ser posterior à data de início',
    path: ['endsAt'],
  })

export type CreateSponsoredSlotInput = z.infer<typeof createSponsoredSlotSchema>

export const updateSponsoredSlotSchema = z
  .object({
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED']).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (d) => {
      if (d.startsAt && d.endsAt) return d.endsAt.getTime() > d.startsAt.getTime()
      return true
    },
    { message: 'A data de fim tem de ser posterior à data de início', path: ['endsAt'] },
  )

export type UpdateSponsoredSlotInput = z.infer<typeof updateSponsoredSlotSchema>

// ─── Admin: listagem (filtros) ───────────────────────────────────────

export const listSponsoredSlotsSchema = z.object({
  breedId: z.coerce.number().int().positive().optional(),
  breederId: z.coerce.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type ListSponsoredSlotsInput = z.infer<typeof listSponsoredSlotsSchema>

// ─── Tracking público (impressão / clique) ───────────────────────────
//
// Não há body — só `:slotId` no path. Rate-limited via apiRateLimit.
