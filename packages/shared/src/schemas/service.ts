// ============================================
// PataCerta — Zod Schemas (Services)
// ============================================

import { z } from 'zod'
import { PriceUnit, ServiceStatus } from '../enums.js'

/**
 * Preço em cêntimos. Obrigatório no MVP.
 * Máx 9999,99€ (999999 cêntimos) — suficiente para o mercado-alvo.
 */
export const priceCentsSchema = z
  .number()
  .int('Preço deve ser um número inteiro de cêntimos')
  .positive('Preço deve ser positivo')
  .max(999999, 'Preço máximo é 9999,99€')

export const createServiceSchema = z.object({
  categoryId: z.number().int().positive(),
  title: z.string().trim().min(5, 'Título demasiado curto').max(200),
  description: z.string().trim().min(20, 'Descrição demasiado curta').max(5000),
  priceCents: priceCentsSchema,
  priceUnit: z.nativeEnum(PriceUnit),
  districtId: z.number().int().positive(),
  municipalityId: z.number().int().positive(),
  addressLine: z.string().trim().max(255).optional(),
  serviceRadiusKm: z.number().int().min(1).max(100).optional(),
  website: z.string().url().max(255).optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^\+351\s?\d{3}\s?\d{3}\s?\d{3}$/, 'Formato: +351 XXX XXX XXX')
    .optional()
    .or(z.literal('')),
  coverageMunicipalityIds: z.array(z.number().int().positive()).max(10).optional(),
})

export const updateServiceSchema = createServiceSchema.partial()

/**
 * Sort order for listing.
 * - recent: por publishedAt DESC
 * - price_asc / price_desc: priceCents
 * - rating: avgRating DESC (reserved — reviews fora do MVP)
 * - distance: por distancia ao ponto (lat,lng) ASC. Requer lat+lng+radiusKm.
 */
export const listServicesQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  municipalityId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().nonnegative().optional(),
  // Raio geográfico opcional. Os três campos têm de ser fornecidos em conjunto.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  sort: z
    .enum(['recent', 'price_asc', 'price_desc', 'rating', 'distance'])
    .optional()
    .default('recent'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
})

/**
 * Map view: lightweight payload with bounding box filter. No pagination.
 */
export const mapServicesQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  municipalityId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().nonnegative().optional(),
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(200),
})

export const publishServiceSchema = z.object({}).strict()
export const pauseServiceSchema = z.object({}).strict()

/**
 * Reorder photos of a service. The client envia a ordem completa desejada.
 * Backend valida que photoIds correspondem exactamente \u00e0s fotos do servi\u00e7o
 * (mesmo conjunto, sem duplicados, sem extras) e aplica os novos sortOrder
 * em transac\u00e7\u00e3o.
 */
export const reorderServicePhotosSchema = z.object({
  photoIds: z
    .array(z.number().int().positive())
    .min(1, 'Indique pelo menos uma foto')
    .max(8, 'M\u00e1ximo 8 fotos'),
})

export const reportServiceSchema = z.object({
  reason: z.string().trim().min(10, 'Indique um motivo com pelo menos 10 caracteres').max(500),
})

export const contactServiceSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(5000),
})

/**
 * Admin: resolve/dismiss service report.
 */
export const resolveServiceReportSchema = z.object({
  resolution: z.string().trim().min(5).max(500),
})

export const suspendServiceSchema = z.object({
  reason: z.string().trim().min(5).max(500),
})

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>
export type MapServicesQuery = z.infer<typeof mapServicesQuerySchema>
export type ReportServiceInput = z.infer<typeof reportServiceSchema>
export type ContactServiceInput = z.infer<typeof contactServiceSchema>
export type ResolveServiceReportInput = z.infer<typeof resolveServiceReportSchema>
export type SuspendServiceInput = z.infer<typeof suspendServiceSchema>
export type ReorderServicePhotosInput = z.infer<typeof reorderServicePhotosSchema>

/** Runtime status transitions (guard in service layer). */
export const SERVICE_STATUS_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  [ServiceStatus.DRAFT]: [ServiceStatus.ACTIVE],
  [ServiceStatus.ACTIVE]: [ServiceStatus.PAUSED, ServiceStatus.SUSPENDED],
  [ServiceStatus.PAUSED]: [ServiceStatus.ACTIVE, ServiceStatus.SUSPENDED],
  [ServiceStatus.SUSPENDED]: [],
}
