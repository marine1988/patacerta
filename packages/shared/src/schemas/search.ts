// ============================================
// PataCerta — Zod Schemas (Search / Directory)
// ============================================

import { z } from 'zod'

export const searchBreedersSchema = z.object({
  speciesId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  municipalityId: z.coerce.number().int().positive().optional(),
  breedId: z.coerce.number().int().positive().optional(),
  query: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type SearchBreedersInput = z.infer<typeof searchBreedersSchema>

// Map view: flat list, no pagination, optional bbox filter
export const mapBreedersSchema = z.object({
  speciesId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  municipalityId: z.coerce.number().int().positive().optional(),
  breedId: z.coerce.number().int().positive().optional(),
  query: z.string().trim().max(200).optional(),
  // Bounding box: south-west and north-east corners
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(1000),
})

export type MapBreedersInput = z.infer<typeof mapBreedersSchema>
