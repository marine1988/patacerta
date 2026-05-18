// ============================================
// PataCerta — Zod Schemas (Search / Directory)
// ============================================

import { z } from 'zod'

export const searchBreedersSchema = z.object({
  speciesId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  municipalityId: z.coerce.number().int().positive().optional(),
  breedId: z.coerce.number().int().positive().optional(),
  // Min length 2 evita ILIKE com 1 caractere ("%a%") que forca full
  // scan em businessName + description (TEXT) sem usar indice — cheap
  // DoS amplification em scraping com varias letras isoladas.
  query: z.string().trim().min(2).max(200).optional(),
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
  query: z.string().trim().min(2).max(200).optional(),
  // Bounding box: south-west and north-east corners
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
  // Limite reduzido de 2000 para 500. Mesmo com searchRateLimit
  // (30/min/IP), 2000 breeders x 4 joins x 30 req/min = 240k rows/min/IP
  // — DoS facil de uma sessao anonima. 500 e' suficiente para um mapa
  // com cluster a' escala nacional e mantem o payload abaixo dos ~150kb.
  limit: z.coerce.number().int().min(1).max(500).default(500),
})

export type MapBreedersInput = z.infer<typeof mapBreedersSchema>
