import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'
import { cacheGetOrSet } from '../../lib/cache.js'

/**
 * GET /api/home/featured
 *
 * Devolve duas listas ordenadas para os carrosseis da homepage:
 *   - services: ate 12 servicos
 *   - breeders: ate 12 criadores
 *
 * Regra: anuncios "promovidos" (featuredUntil > now()) aparecem sempre
 * primeiro, em ordem aleatoria entre si. Se nao chegarem a 12, completamos
 * com items nao-promovidos tambem em ordem aleatoria. Cada page-load
 * produz uma ordem diferente (shuffle e' pos-cache).
 *
 * Cache: a query base (4 findMany + 1 groupBy) e' cacheada 60s em Redis
 * — uma das paginas mais visitadas do site. O shuffle e o slice por SLOT_COUNT
 * acontecem depois, garantindo variedade visual entre requests mesmo com
 * cache quente.
 */
const SLOT_COUNT = 12
const FEATURED_TTL_MS = 60_000
const FEATURED_CACHE_KEY = 'home:featured:v1'

interface FeaturedCachePayload {
  featuredServices: Array<Record<string, unknown>>
  fallbackServices: Array<Record<string, unknown>>
  featuredBreeders: Array<{ id: number } & Record<string, unknown>>
  fallbackBreeders: Array<{ id: number } & Record<string, unknown>>
  breederRatings: Array<{ id: number; avgRating: number | null; reviewCount: number }>
}

async function loadFeaturedPayload(): Promise<FeaturedCachePayload> {
  const now = new Date()
  const [featuredServices, fallbackServices, featuredBreeders, fallbackBreeders] =
    await Promise.all([
      prisma.service.findMany({
        where: { status: 'ACTIVE', featuredUntil: { gt: now } },
        select: featuredServiceSelect(),
        // Pegamos ate 50 candidatos e baralhamos em JS — evita ORDER BY RANDOM
        // que e' caro em postgres.
        take: 50,
        orderBy: { featuredUntil: 'desc' },
      }),
      prisma.service.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ featuredUntil: null }, { featuredUntil: { lte: now } }],
        },
        select: featuredServiceSelect(),
        take: 50,
        orderBy: { publishedAt: 'desc' },
      }),
      prisma.breeder.findMany({
        where: { status: 'VERIFIED', featuredUntil: { gt: now } },
        select: featuredBreederSelect(),
        take: 50,
        orderBy: { featuredUntil: 'desc' },
      }),
      prisma.breeder.findMany({
        where: {
          status: 'VERIFIED',
          OR: [{ featuredUntil: null }, { featuredUntil: { lte: now } }],
        },
        select: featuredBreederSelect(),
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    ])

  // Agregar ratings dos breeders num so' groupBy (em vez de N+1).
  const breederIds = [...featuredBreeders, ...fallbackBreeders].map((b) => b.id)
  const breederRatings = await aggregateBreederRatings(breederIds)

  return {
    featuredServices,
    fallbackServices,
    featuredBreeders,
    fallbackBreeders,
    breederRatings,
  }
}

export const getFeatured = asyncHandler(async (_req, res) => {
  const payload = await cacheGetOrSet(
    FEATURED_CACHE_KEY,
    FEATURED_TTL_MS,
    loadFeaturedPayload,
  )

  const services = pickRandom(
    [...shuffle(payload.featuredServices), ...shuffle(payload.fallbackServices)],
    SLOT_COUNT,
  )
  const breedersRaw = pickRandom(
    [...shuffle(payload.featuredBreeders), ...shuffle(payload.fallbackBreeders)],
    SLOT_COUNT,
  )

  const ratingById = new Map(
    payload.breederRatings.map((r) => [r.id, { avg: r.avgRating, count: r.reviewCount }]),
  )
  const breeders = breedersRaw.map((b) => ({
    ...b,
    avgRating: ratingById.get(b.id)?.avg ?? null,
    reviewCount: ratingById.get(b.id)?.count ?? 0,
  }))

  res.json({ services, breeders })
})

async function aggregateBreederRatings(
  ids: number[],
): Promise<Array<{ id: number; avgRating: number | null; reviewCount: number }>> {
  if (ids.length === 0) return []
  const aggs = await prisma.review.groupBy({
    by: ['breederId'],
    where: { breederId: { in: ids }, status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: { id: true },
  })
  return aggs.map((a) => ({
    id: a.breederId,
    avgRating: a._avg.rating != null ? Math.round(a._avg.rating * 10) / 10 : null,
    reviewCount: a._count.id,
  }))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n)
}

function featuredServiceSelect() {
  return {
    id: true,
    title: true,
    priceCents: true,
    priceUnit: true,
    currency: true,
    avgRating: true,
    reviewCount: true,
    featuredUntil: true,
    photos: {
      select: { id: true, url: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' as const },
      take: 1,
    },
    category: { select: { id: true, nameSlug: true, namePt: true } },
    district: { select: { id: true, namePt: true } },
    municipality: { select: { id: true, namePt: true } },
  }
}

function featuredBreederSelect() {
  return {
    id: true,
    businessName: true,
    description: true,
    featuredUntil: true,
    district: { select: { id: true, namePt: true } },
    municipality: { select: { id: true, namePt: true } },
    photos: {
      select: { id: true, url: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' as const },
      take: 1,
    },
  }
}
