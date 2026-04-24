// ============================================
// PataCerta — Geocoding (Nominatim client)
// ============================================
//
// Best-effort resolution of a service address to (lat, lng).
// Strategy:
//   1. Build a query from (addressLine, municipality, district, Portugal).
//   2. Query Nominatim (OSM) with a descriptive User-Agent (OSM policy).
//   3. On any failure (network, HTTP error, empty result, timeout), fall back
//      to the district centroid stored in the `districts` table.
//
// Design notes:
// - Nominatim free tier requires a valid contact email in the User-Agent;
//   see https://operations.osmfoundation.org/policies/nominatim/. The email
//   is configured via NOMINATIM_EMAIL.
// - We never throw from `geocodeService`: geocoding is non-critical for the
//   service listing flow. Callers always receive usable coordinates (either
//   Nominatim result or the district centroid fallback) plus a `source`
//   discriminator that is persisted on the Service row.
// - Timeout is hard-capped at 5s to avoid slowing down POST/PATCH requests.

import { prisma } from './prisma.js'

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org'
const TIMEOUT_MS = 5000

export type GeocodeSource = 'nominatim' | 'district_centroid' | 'none'

export interface GeocodeResult {
  latitude: number | null
  longitude: number | null
  source: GeocodeSource
}

interface GeocodeInput {
  addressLine?: string | null
  districtId: number
  municipalityId: number
}

interface NominatimHit {
  lat: string
  lon: string
}

function getBaseUrl(): string {
  return process.env.NOMINATIM_BASE_URL?.replace(/\/+$/, '') || DEFAULT_BASE_URL
}

function getUserAgent(): string {
  const email = process.env.NOMINATIM_EMAIL || 'contact@patacerta.pt'
  return `PataCerta/1.0 (${email})`
}

async function queryNominatim(query: string): Promise<NominatimHit | null> {
  const url = new URL(`${getBaseUrl()}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'pt')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': getUserAgent(),
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as NominatimHit[]
    if (!Array.isArray(data) || data.length === 0) return null
    const first = data[0]
    if (!first || typeof first.lat !== 'string' || typeof first.lon !== 'string') return null
    return first
  } catch {
    // Network error, abort, or JSON parse failure — fall back.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve a service address to (lat, lng).
 *
 * Always resolves — never throws. When Nominatim fails or returns no hit,
 * falls back to the district centroid. If the district has no centroid
 * stored, returns `{ lat: null, lng: null, source: 'none' }`.
 */
export async function geocodeService(input: GeocodeInput): Promise<GeocodeResult> {
  const [district, municipality] = await Promise.all([
    prisma.district.findUnique({
      where: { id: input.districtId },
      select: { namePt: true, latitude: true, longitude: true },
    }),
    prisma.municipality.findUnique({
      where: { id: input.municipalityId },
      select: { namePt: true },
    }),
  ])

  // Build query: "<addressLine>, <municipality>, <district>, Portugal"
  const parts = [
    input.addressLine?.trim() || null,
    municipality?.namePt || null,
    district?.namePt || null,
    'Portugal',
  ].filter(Boolean) as string[]

  if (parts.length >= 2) {
    const hit = await queryNominatim(parts.join(', '))
    if (hit) {
      const lat = parseFloat(hit.lat)
      const lng = parseFloat(hit.lon)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng, source: 'nominatim' }
      }
    }
  }

  // Fallback: district centroid
  if (district?.latitude != null && district?.longitude != null) {
    return {
      latitude: district.latitude,
      longitude: district.longitude,
      source: 'district_centroid',
    }
  }

  return { latitude: null, longitude: null, source: 'none' }
}
