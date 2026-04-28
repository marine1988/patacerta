import { prisma } from '../../lib/prisma.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import type { SearchBreedersInput, MapBreedersInput } from '@patacerta/shared'
import { Prisma } from '@prisma/client'

// P4: Simple in-memory TTL cache for static reference data
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const TTL = 3600_000 // 1 hour
let districtsCache: CacheEntry<unknown[]> | null = null
let statsCache: CacheEntry<Record<string, number>> | null = null

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

  const [breeders, total] = await Promise.all([
    prisma.breeder.findMany({
      where,
      include: {
        district: { select: { id: true, namePt: true } },
        municipality: { select: { id: true, namePt: true } },
        photos: {
          select: { id: true, url: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
        reviews: {
          where: { status: 'PUBLISHED' },
          select: { rating: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.breeder.count({ where }),
  ])

  // B-08: Explicit response shape — no internal fields leak through
  const data = breeders.map((b) => {
    const ratings = b.reviews.map((r) => r.rating)
    const avgRating =
      ratings.length > 0
        ? Math.round((ratings.reduce((a, c) => a + c, 0) / ratings.length) * 10) / 10
        : null

    return {
      id: b.id,
      businessName: b.businessName,
      description: b.description,
      status: b.status,
      district: b.district,
      municipality: b.municipality,
      photos: b.photos,
      avgRating,
      reviewCount: ratings.length,
      createdAt: b.createdAt,
    }
  })

  res.json(paginatedResponse(data, total, page, limit))
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
    include: {
      district: { select: { id: true, namePt: true, latitude: true, longitude: true } },
      municipality: { select: { id: true, namePt: true } },
      reviews: {
        where: { status: 'PUBLISHED' },
        select: { rating: true },
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  const data = breeders
    .filter((b) => b.district.latitude !== null && b.district.longitude !== null)
    .map((b) => {
      const ratings = b.reviews.map((r) => r.rating)
      const avgRating =
        ratings.length > 0
          ? Math.round((ratings.reduce((a, c) => a + c, 0) / ratings.length) * 10) / 10
          : null

      return {
        id: b.id,
        businessName: b.businessName,
        status: b.status,
        district: { id: b.district.id, namePt: b.district.namePt },
        municipality: b.municipality,
        avgRating,
        reviewCount: ratings.length,
        latitude: b.district.latitude as number,
        longitude: b.district.longitude as number,
      }
    })

  res.json({ data, total: data.length })
})

// P4: Cached — districts rarely change
export const listDistricts = asyncHandler(async (_req, res) => {
  const now = Date.now()
  if (!districtsCache || districtsCache.expiresAt < now) {
    const data = await prisma.district.findMany({
      orderBy: { namePt: 'asc' },
      select: { id: true, code: true, namePt: true, latitude: true, longitude: true },
    })
    districtsCache = { data, expiresAt: now + TTL }
  }
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(districtsCache.data)
})

export const listMunicipalities = asyncHandler(async (req, res) => {
  const districtId = parseId(req.params.districtId)

  const municipalities = await prisma.municipality.findMany({
    where: { districtId },
    orderBy: { namePt: 'asc' },
    select: { id: true, code: true, namePt: true },
  })

  res.set('Cache-Control', 'public, max-age=3600')
  res.json(municipalities)
})

// Public stats for homepage — cached 1hr
export const getPublicStats = asyncHandler(async (_req, res) => {
  const now = Date.now()
  if (!statsCache || statsCache.expiresAt < now) {
    const [breederCount, breedCount, districtCount, reviewCount, serviceCount] = await Promise.all([
      prisma.breeder.count({ where: { status: 'VERIFIED' } }),
      prisma.breed.count(),
      prisma.district.count(),
      prisma.review.count({ where: { status: 'PUBLISHED' } }),
      prisma.service.count({ where: { status: 'ACTIVE' } }),
    ])
    statsCache = {
      data: { breederCount, breedCount, districtCount, reviewCount, serviceCount },
      expiresAt: now + TTL,
    }
  }
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(statsCache.data)
})
