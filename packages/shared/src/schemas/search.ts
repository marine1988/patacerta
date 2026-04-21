// ============================================
// PataCerta — Zod Schemas (Search / Directory)
// ============================================

import { z } from 'zod'

export const searchBreedersSchema = z.object({
  speciesId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  municipalityId: z.coerce.number().int().positive().optional(),
  query: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type SearchBreedersInput = z.infer<typeof searchBreedersSchema>
