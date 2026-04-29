import { prisma } from '../../lib/prisma.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { cacheGetOrSet } from '../../lib/cache.js'
import type { SearchBreedersInput, MapBreedersInput } from '@patacerta/shared'
import { Prisma } from '@prisma/client'

const TTL_MS = 3600_000 // 1h
const CACHE_KEY_DISTRICTS = 'search:districts:v1'
const CACHE_KEY_STATS = 'search:public-stats:v1'
const CACHE_KEY_MUNICIPALITIES = 'search:municipalities:district:v1'

export const searchBreeders = asyncHandler(async (req, res) => {
  // MVP so-caes: speciesId aceite no schema para retrocompatibilidade mas ignorado.
  const { districtId, municipalityId, breedId, query, page, limit } =
    req.query as unknown as SearchBreedersInput

  const where: Prisma.BreederWhereInput = { status: 'VERIFIED' }

  if (districtId) where.districtId = districtId
  if (municipalityId) where.municipalityId = municipalityId
  if (breedId) where.breeds = { some: { breedId } }
  if (query) {
    where.OR = [
      { businessName: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ]
  }

  // Usa avgRating/reviewCount desnormalizados em Breeder — evita o
  // include de reviews + agregacao em JS (era N+1 por listagem).
  const [breeders, total] = await Promise.all([
    prisma.breeder.findMany({
      where,
      select: {
        id: true,
        businessName: true,
        description: true,
        status: true,
        avgRating: true,
        reviewCount: true,
        createdAt: true,
        district: { select: { id: true, namePt: true } },
        municipality: { select: { id: true, namePt: true } },
        photos: {
          select: { id: true, url: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.breeder.count({ where }),
  ])

  res.json(paginatedResponse(breeders, total, page, limit))
})

// Map view: flat list with coordinates (herdadas do distrito). No pagination.
export const mapBreeders = asyncHandler(async (req, res) => {
  // MVP so-caes: speciesId aceite no schema para retrocompatibilidade mas ignorado.
  const { districtId, municipalityId, breedId, query, minLat, maxLat, minLng, maxLng, limit } =
    req.query as unknown as MapBreedersInput

  const where: Prisma.BreederWhereInput = { status: 'VERIFIED' }

  if (districtId) where.districtId = districtId
  if (municipalityId) where.municipalityId = municipalityId
  if (breedId) where.breeds = { some: { breedId } }
  if (query) {
    where.OR = [
      { businessName: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ]
  }

  // Only breeders whose district has coordinates (all should, post-seed)
  where.district = { latitude: { not: null }, longitude: { not: null } }

  // Bbox filter applied at district level (breeders inherit district coords)
  if (
    minLat !== undefined &&
    maxLat !== undefined &&
    minLng !== undefined &&
    maxLng !== undefined
  ) {
    where.district = {
      ...where.district,
      latitude: { gte: minLat, lte: maxLat, not: null },
      longitude: { gte: minLng, lte: maxLng, not: null },
    }
  }

  const breeders = await prisma.breeder.findMany({
    where,
    select: {
      id: true,
      businessName: true,
      status: true,
      avgRating: true,
      reviewCount: true,
      district: { select: { id: true, namePt: true, latitude: true, longitude: true } },
      municipality: { select: { id: true, namePt: true } },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  const data = breeders
    .filter((b) => b.district.latitude !== null && b.district.longitude !== null)
    .map((b) => ({
      id: b.id,
      businessName: b.businessName,
      status: b.status,
      district: { id: b.district.id, namePt: b.district.namePt },
      municipality: b.municipality,
      avgRating: b.avgRating,
      reviewCount: b.reviewCount,
      latitude: b.district.latitude as number,
      longitude: b.district.longitude as number,
    }))

  res.json({ data, total: data.length })
})

// Cached — districts rarely change. Redis-backed via lib/cache.
export const listDistricts = asyncHandler(async (_req, res) => {
  const data = await cacheGetOrSet(CACHE_KEY_DISTRICTS, TTL_MS, async () => {
    return prisma.district.findMany({
      orderBy: { namePt: 'asc' },
      select: { id: true, code: true, namePt: true, latitude: true, longitude: true },
    })
  })
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(data)
})

export const listMunicipalities = asyncHandler(async (req, res) => {
  const districtId = parseId(req.params.districtId)

  // Cache por distrito — municipalities sao essencialmente estaticos.
  const municipalities = await cacheGetOrSet(
    `${CACHE_KEY_MUNICIPALITIES}:${districtId}`,
    TTL_MS,
    async () =>
      prisma.municipality.findMany({
        where: { districtId },
        orderBy: { namePt: 'asc' },
        select: { id: true, code: true, namePt: true },
      }),
  )

  res.set('Cache-Control', 'public, max-age=3600')
  res.json(municipalities)
})

// Public stats for homepage — Redis-cached 1h.
export const getPublicStats = asyncHandler(async (_req, res) => {
  const data = await cacheGetOrSet(CACHE_KEY_STATS, TTL_MS, async () => {
    const [breederCount, breedCount, districtCount, reviewCount, serviceCount] = await Promise.all([
      prisma.breeder.count({ where: { status: 'VERIFIED' } }),
      prisma.breed.count(),
      prisma.district.count(),
      prisma.review.count({ where: { status: 'PUBLISHED' } }),
      prisma.service.count({ where: { status: 'ACTIVE' } }),
    ])
    return { breederCount, breedCount, districtCount, reviewCount, serviceCount }
  })
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(data)
})
