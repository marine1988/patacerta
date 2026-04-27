import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'

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
 * produz uma ordem diferente — assim quem paga tem garantia de aparecer
 * mas a posicao nao e' fixa.
 *
 * Sem cache HTTP: o conteudo varia a cada request.
 */
const SLOT_COUNT = 12

export const getFeatured = asyncHandler(async (_req, res) => {
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

  res.json({
    services: pickRandom([...shuffle(featuredServices), ...shuffle(fallbackServices)], SLOT_COUNT),
    breeders: pickRandom([...shuffle(featuredBreeders), ...shuffle(fallbackBreeders)], SLOT_COUNT),
  })
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
    avgRating: true,
    reviewCount: true,
    featuredUntil: true,
    district: { select: { id: true, namePt: true } },
    municipality: { select: { id: true, namePt: true } },
    species: {
      select: { species: { select: { id: true, namePt: true } } },
    },
  }
}
