// ============================================
// PataCerta — Tipos de serviços partilhados
// ============================================
//
// Espelha a forma devolvida pela API REST para serviços (passeios +
// pet-sitting). Cada página tipa um subset/superset destes campos
// consoante o endpoint que consome.

import type { ServicePriceUnit } from './format'

export type ServiceStatusValue = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED'

/** Categoria mínima usada em listagens, formulários e detalhe. */
export interface ServiceCategory {
  id: number
  nameSlug: string
  namePt: string
}

/** Foto associada a um serviço, com ordem persistida. */
export interface ServicePhoto {
  id: number
  url: string
  sortOrder: number
}

/** Localização (distrito/município) associada a um serviço. */
export interface ServiceLocation {
  id: number
  namePt: string
}

/**
 * Campos comuns a todas as representações de serviço (listagem, detalhe,
 * gestão). Páginas que precisam de campos adicionais estendem com
 * intersection.
 */
export interface ServiceBase {
  id: number
  providerId: number
  categoryId: number
  title: string
  description: string
  priceCents: number
  priceUnit: ServicePriceUnit
  currency: string
  districtId: number
  municipalityId: number
  latitude: number | null
  longitude: number | null
  serviceRadiusKm: number | null
  website: string | null
  phone: string | null
  avgRating: number | null
  reviewCount: number
  publishedAt: string | null
  createdAt: string
  district: ServiceLocation
  municipality: ServiceLocation
}
