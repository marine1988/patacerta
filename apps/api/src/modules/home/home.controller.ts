import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'
import { cacheGetOrSet, cacheDel } from '../../lib/cache.js'

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
 * Cache: a query base (4 findMany) e' cacheada 60s em Redis — uma das
 * paginas mais visitadas do site. O shuffle e o slice por SLOT_COUNT
 * acontecem depois, garantindo variedade visual entre requests mesmo
 * com cache quente.
 *
 * Ratings dos breeders ja' vivem desnormalizados em Breeder.avgRating
 * e Breeder.reviewCount (mantidos por services/breeder-stats.ts).
 */
const SLOT_COUNT = 12
const FEATURED_TTL_MS = 60_000
export const FEATURED_CACHE_KEY = 'home:featured:v2'

/**
 * Invalida o cache do payload da homepage. Chamar sempre que uma
 * mutacao afecte o conjunto visivel: featured toggle (admin), status
 * change (admin/owner), suspensao de utilizador (admin), eliminacao de
 * service/breeder. Caso contrario o carrossel pode mostrar items
 * inactivos ate 60s.
 */
export async function invalidateFeaturedCache(): Promise<void> {
  await cacheDel(FEATURED_CACHE_KEY)
}

interface FeaturedCachePayload {
  featuredServices: unknown[]
  fallbackServices: unknown[]
  featuredBreeders: unknown[]
  fallbackBreeders: unknown[]
}

async function loadFeaturedPayload(): Promise<FeaturedCachePayload> {
  const now = new Date()
  // Filtros de actividade: services com provider activo, breeders com user
  // activo. Mantemos o paralelismo com os filtros das listagens publicas
  // em search.controller.ts — caso contrario um criador suspenso continua
  // a aparecer no carrossel da homepage ate o admin baixar manualmente
  // breeder.status, o que e' inconsistente com a regra "isActive=false
  // significa invisivel em toda a parte publica".
  const providerActiveFilter = { provider: { isActive: true, suspendedAt: null } } as const
  const breederUserActiveFilter = { user: { isActive: true, suspendedAt: null } } as const

  const [featuredServices, fallbackServices, featuredBreeders, fallbackBreeders] =
    await Promise.all([
      prisma.service.findMany({
        where: { status: 'ACTIVE', featuredUntil: { gt: now }, ...providerActiveFilter },
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
          ...providerActiveFilter,
        },
        select: featuredServiceSelect(),
        take: 50,
        orderBy: { publishedAt: 'desc' },
      }),
      prisma.breeder.findMany({
        where: { status: 'VERIFIED', featuredUntil: { gt: now }, ...breederUserActiveFilter },
        select: featuredBreederSelect(),
        take: 50,
        orderBy: { featuredUntil: 'desc' },
      }),
      prisma.breeder.findMany({
        where: {
          status: 'VERIFIED',
          OR: [{ featuredUntil: null }, { featuredUntil: { lte: now } }],
          ...breederUserActiveFilter,
        },
        select: featuredBreederSelect(),
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    ])

  return { featuredServices, fallbackServices, featuredBreeders, fallbackBreeders }
}

export const getFeatured = asyncHandler(async (_req, res) => {
  const payload = await cacheGetOrSet(FEATURED_CACHE_KEY, FEATURED_TTL_MS, loadFeaturedPayload)

  const services = pickRandom(
    [...shuffle(payload.featuredServices), ...shuffle(payload.fallbackServices)],
    SLOT_COUNT,
  )
  const breeders = pickRandom(
    [...shuffle(payload.featuredBreeders), ...shuffle(payload.fallbackBreeders)],
    SLOT_COUNT,
  )

  res.json({ services, breeders })
})

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
    slug: true,
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
    slug: true,
    businessName: true,
    description: true,
    avgRating: true,
    reviewCount: true,
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
