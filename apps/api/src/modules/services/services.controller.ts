// ============================================
// PataCerta — Services Controller
// ============================================
//
// Scope (PR-2 + PR-3):
//   - Owner/provider CRUD of their own service listings.
//   - Status transitions: DRAFT → ACTIVE → PAUSED, ACTIVE/PAUSED → SUSPENDED (admin-only elsewhere).
//   - Photo management (multer + sharp resize, MinIO storage).
//   - Best-effort geocoding on create/update (via lib/geocoding).
//   - Public listing / detail / map endpoints.
//   - Contact (polymorphic Thread: serviceId branch) + reports.
//
// Admin moderation (list/resolve/dismiss/suspend) lives in the admin module.
//
// Convention notes (kept in sync with the other API modules):
//   - No separate *.service.ts / *.dto.ts; controllers own the business
//     logic, Zod schemas live in @patacerta/shared.
//   - Ownership checks run inside the controller using req.user.userId.
//   - `asyncHandler` wraps every handler; never use try/catch.
//   - AppError(status, msg, code) for all user-facing errors.

import type { Request, Response } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { uploadFile, deleteFile } from '../../lib/minio.js'
import { logAudit } from '../../lib/audit.js'
import { geocodeService } from '../../lib/geocoding.js'
import {
  SERVICE_STATUS_TRANSITIONS,
  ServiceStatus,
  type ContactServiceInput,
  type CreateServiceInput,
  type ListServicesQuery,
  type MapServicesQuery,
  type ReportServiceInput,
  type UpdateServiceInput,
} from '@patacerta/shared'
import { Prisma } from '@prisma/client'

const MAX_PHOTOS_PER_SERVICE = 8
const PHOTO_MAX_DIMENSION = 1600
const PHOTO_JPEG_QUALITY = 85

// ── Multer config (photos) ────────────────────────────────────────────
// 2MB limit is enforced pre-sharp; sharp then resizes to 1600px max side
// and re-encodes to JPEG q85. We accept up to 8 files in a single request.

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: MAX_PHOTOS_PER_SERVICE,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(
        new AppError(
          400,
          'Tipo de ficheiro não suportado. Use JPG, PNG ou WebP.',
          'INVALID_FILE_TYPE',
        ) as unknown as Error,
      )
    }
  },
}).array('photos', MAX_PHOTOS_PER_SERVICE)

function runPhotoMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    photoUpload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return reject(new AppError(400, 'Cada foto pode ter no máximo 2MB', 'FILE_TOO_LARGE'))
          }
          if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
            return reject(
              new AppError(
                400,
                `Máximo ${MAX_PHOTOS_PER_SERVICE} fotos por anúncio`,
                'TOO_MANY_PHOTOS',
              ),
            )
          }
        }
        return reject(err)
      }
      resolve()
    })
  })
}

// ── Role promotion ───────────────────────────────────────────────────
// First time a user creates a service, we promote OWNER → SERVICE_PROVIDER.
// Admins and breeders keep their existing role.

async function promoteToServiceProviderIfNeeded(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user) return
  if (user.role === 'OWNER') {
    await prisma.user.update({ where: { id: userId }, data: { role: 'SERVICE_PROVIDER' } })
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

async function loadOwnedService(serviceId: number, userId: number) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!service) throw new AppError(404, 'Anúncio não encontrado', 'SERVICE_NOT_FOUND')
  if (service.providerId !== userId) {
    throw new AppError(403, 'Sem permissão para este anúncio', 'FORBIDDEN')
  }
  return service
}

async function syncCoverageAreas(serviceId: number, municipalityIds: number[]): Promise<void> {
  // Replace-all strategy — small set (max 10), simpler than diffing.
  // Envolvido em $transaction para evitar estado inconsistente (coberturas
  // apagadas mas novas por inserir) se a segunda query falhar.
  await prisma.$transaction(async (tx) => {
    await tx.serviceCoverage.deleteMany({ where: { serviceId } })
    if (municipalityIds.length === 0) return
    await tx.serviceCoverage.createMany({
      data: municipalityIds.map((municipalityId) => ({ serviceId, municipalityId })),
      skipDuplicates: true,
    })
  })
}

function publicServiceSelect() {
  return {
    id: true,
    providerId: true,
    categoryId: true,
    title: true,
    description: true,
    priceCents: true,
    priceUnit: true,
    currency: true,
    districtId: true,
    municipalityId: true,
    addressLine: true,
    latitude: true,
    longitude: true,
    geocodedAt: true,
    geocodeSource: true,
    serviceRadiusKm: true,
    status: true,
    website: true,
    phone: true,
    avgRating: true,
    reviewCount: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
    photos: {
      select: { id: true, url: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' as const },
    },
    coverageAreas: {
      select: { municipalityId: true },
    },
    category: {
      select: { id: true, nameSlug: true, namePt: true },
    },
    district: { select: { id: true, namePt: true } },
    municipality: { select: { id: true, namePt: true } },
  }
}

// ─────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/services
 * Create a new service listing (status=DRAFT).
 * Geocoding is attempted best-effort; failures never block creation.
 */
export const createService = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const input = req.body as CreateServiceInput

  // Validate category exists & is active
  const category = await prisma.serviceCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, isActive: true },
  })
  if (!category || !category.isActive) {
    throw new AppError(400, 'Categoria inválida ou inactiva', 'INVALID_CATEGORY')
  }

  // Validate municipality belongs to district
  const municipality = await prisma.municipality.findUnique({
    where: { id: input.municipalityId },
    select: { districtId: true },
  })
  if (!municipality || municipality.districtId !== input.districtId) {
    throw new AppError(400, 'Concelho não pertence ao distrito indicado', 'MUNICIPALITY_MISMATCH')
  }

  // Validate coverage municipalities (if any)
  const coverageIds = input.coverageMunicipalityIds ?? []
  if (coverageIds.length > 0) {
    const count = await prisma.municipality.count({ where: { id: { in: coverageIds } } })
    if (count !== coverageIds.length) {
      throw new AppError(400, 'Concelhos de cobertura inválidos', 'INVALID_COVERAGE')
    }
  }

  // Best-effort geocoding
  const geo = await geocodeService({
    addressLine: input.addressLine ?? null,
    districtId: input.districtId,
    municipalityId: input.municipalityId,
  })

  const service = await prisma.service.create({
    data: {
      providerId: userId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      priceCents: input.priceCents,
      priceUnit: input.priceUnit,
      districtId: input.districtId,
      municipalityId: input.municipalityId,
      addressLine: input.addressLine || null,
      latitude: geo.latitude,
      longitude: geo.longitude,
      geocodedAt: geo.source !== 'none' ? new Date() : null,
      geocodeSource: geo.source !== 'none' ? geo.source : null,
      serviceRadiusKm: input.serviceRadiusKm ?? null,
      website: input.website || null,
      phone: input.phone || null,
    },
  })

  await syncCoverageAreas(service.id, coverageIds)
  await promoteToServiceProviderIfNeeded(userId)

  await logAudit({
    userId,
    action: 'service.create',
    entity: 'service',
    entityId: service.id,
    details: JSON.stringify({ title: service.title, categoryId: service.categoryId }),
    ipAddress: req.ip,
  })

  const full = await prisma.service.findUnique({
    where: { id: service.id },
    select: publicServiceSelect(),
  })

  res.status(201).json(full)
})

/**
 * PATCH /api/services/:serviceId
 * Full free edit — no edit window, no tombstone.
 * Re-geocodes when address/district/municipality change.
 */
export const updateService = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  const input = req.body as UpdateServiceInput

  const existing = await loadOwnedService(serviceId, userId)

  if (input.categoryId && input.categoryId !== existing.categoryId) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: input.categoryId },
      select: { isActive: true },
    })
    if (!category || !category.isActive) {
      throw new AppError(400, 'Categoria inválida ou inactiva', 'INVALID_CATEGORY')
    }
  }

  // If district or municipality change together, validate consistency.
  const nextDistrictId = input.districtId ?? existing.districtId
  const nextMunicipalityId = input.municipalityId ?? existing.municipalityId
  if (input.districtId || input.municipalityId) {
    const municipality = await prisma.municipality.findUnique({
      where: { id: nextMunicipalityId },
      select: { districtId: true },
    })
    if (!municipality || municipality.districtId !== nextDistrictId) {
      throw new AppError(400, 'Concelho não pertence ao distrito indicado', 'MUNICIPALITY_MISMATCH')
    }
  }

  if (input.coverageMunicipalityIds && input.coverageMunicipalityIds.length > 0) {
    const count = await prisma.municipality.count({
      where: { id: { in: input.coverageMunicipalityIds } },
    })
    if (count !== input.coverageMunicipalityIds.length) {
      throw new AppError(400, 'Concelhos de cobertura inválidos', 'INVALID_COVERAGE')
    }
  }

  const locationChanged =
    input.districtId !== undefined ||
    input.municipalityId !== undefined ||
    input.addressLine !== undefined

  const data: Record<string, unknown> = {}
  if (input.categoryId !== undefined) data.categoryId = input.categoryId
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) data.description = input.description
  if (input.priceCents !== undefined) data.priceCents = input.priceCents
  if (input.priceUnit !== undefined) data.priceUnit = input.priceUnit
  if (input.districtId !== undefined) data.districtId = input.districtId
  if (input.municipalityId !== undefined) data.municipalityId = input.municipalityId
  if (input.addressLine !== undefined) data.addressLine = input.addressLine || null
  if (input.serviceRadiusKm !== undefined) data.serviceRadiusKm = input.serviceRadiusKm
  if (input.website !== undefined) data.website = input.website || null
  if (input.phone !== undefined) data.phone = input.phone || null

  if (locationChanged) {
    const geo = await geocodeService({
      addressLine: (data.addressLine as string | null | undefined) ?? existing.addressLine,
      districtId: nextDistrictId,
      municipalityId: nextMunicipalityId,
    })
    data.latitude = geo.latitude
    data.longitude = geo.longitude
    data.geocodedAt = geo.source !== 'none' ? new Date() : null
    data.geocodeSource = geo.source !== 'none' ? geo.source : null
  }

  await prisma.service.update({ where: { id: serviceId }, data })

  if (input.coverageMunicipalityIds !== undefined) {
    await syncCoverageAreas(serviceId, input.coverageMunicipalityIds)
  }

  await logAudit({
    userId,
    action: 'service.update',
    entity: 'service',
    entityId: serviceId,
    ipAddress: req.ip,
  })

  const full = await prisma.service.findUnique({
    where: { id: serviceId },
    select: publicServiceSelect(),
  })
  res.json(full)
})

/**
 * POST /api/services/:serviceId/publish — DRAFT/PAUSED → ACTIVE
 */
export const publishService = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  const existing = await loadOwnedService(serviceId, userId)

  const allowed = SERVICE_STATUS_TRANSITIONS[existing.status] ?? []
  if (!allowed.includes(ServiceStatus.ACTIVE)) {
    throw new AppError(
      400,
      `Não é possível publicar um anúncio com estado ${existing.status}`,
      'INVALID_STATUS_TRANSITION',
    )
  }

  // Require at least one photo to publish.
  const photoCount = await prisma.servicePhoto.count({ where: { serviceId } })
  if (photoCount === 0) {
    throw new AppError(400, 'Adicione pelo menos uma foto antes de publicar', 'NO_PHOTOS')
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: {
      status: 'ACTIVE',
      publishedAt: existing.publishedAt ?? new Date(),
    },
  })

  await logAudit({
    userId,
    action: 'service.publish',
    entity: 'service',
    entityId: serviceId,
    ipAddress: req.ip,
  })

  res.json({ ok: true, status: 'ACTIVE' })
})

/**
 * POST /api/services/:serviceId/pause — ACTIVE → PAUSED
 */
export const pauseService = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  const existing = await loadOwnedService(serviceId, userId)

  const allowed = SERVICE_STATUS_TRANSITIONS[existing.status] ?? []
  if (!allowed.includes(ServiceStatus.PAUSED)) {
    throw new AppError(
      400,
      `Não é possível pausar um anúncio com estado ${existing.status}`,
      'INVALID_STATUS_TRANSITION',
    )
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: { status: 'PAUSED' },
  })

  await logAudit({
    userId,
    action: 'service.pause',
    entity: 'service',
    entityId: serviceId,
    ipAddress: req.ip,
  })

  res.json({ ok: true, status: 'PAUSED' })
})

/**
 * DELETE /api/services/:serviceId
 * Soft-delete: transition to SUSPENDED with a removed_reason (owner-initiated).
 * We keep the row for audit/messaging continuity.
 */
export const deleteService = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  const existing = await loadOwnedService(serviceId, userId)

  if (existing.status === 'SUSPENDED') {
    throw new AppError(400, 'Anúncio já se encontra removido', 'ALREADY_REMOVED')
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: {
      status: 'SUSPENDED',
      removedAt: new Date(),
      removedReason: 'Removido pelo anunciante',
    },
  })

  await logAudit({
    userId,
    action: 'service.delete',
    entity: 'service',
    entityId: serviceId,
    ipAddress: req.ip,
  })

  res.status(204).send()
})

/**
 * GET /api/services/mine — list the authenticated user's own services
 *
 * Pagina pouco (default 50, max 100) apenas para impedir payloads gigantes
 * em casos patologicos. Clientes existentes continuam a receber o envelope
 * `{ data }`; `meta` e' informativo.
 */
export const getMyServices = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const rawPage = Number(req.query.page)
  const rawLimit = Number(req.query.limit)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 50

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where: { providerId: userId },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: publicServiceSelect(),
    }),
    prisma.service.count({ where: { providerId: userId } }),
  ])

  res.json({
    data: services,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  })
})

/**
 * GET /api/services/mine/:serviceId — owner view (any status)
 */
export const getMyServiceById = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  await loadOwnedService(serviceId, userId) // authorization guard
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: publicServiceSelect(),
  })
  res.json(service)
})

// ─────────────────────────────────────────────────────────────────────
// Photos
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/services/:serviceId/photos
 * Upload 1..N photos. Each is resized (max 1600px side) and re-encoded to JPEG q85.
 * Enforces the 8-photos-per-service cap, counting existing + incoming.
 */
export const uploadPhotos = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  await loadOwnedService(serviceId, userId)

  await runPhotoMulter(req, res)

  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length === 0) {
    throw new AppError(400, 'Nenhuma foto enviada', 'NO_FILES')
  }

  const existingCount = await prisma.servicePhoto.count({ where: { serviceId } })
  if (existingCount + files.length > MAX_PHOTOS_PER_SERVICE) {
    throw new AppError(
      400,
      `Máximo ${MAX_PHOTOS_PER_SERVICE} fotos por anúncio (tem ${existingCount})`,
      'TOO_MANY_PHOTOS',
    )
  }

  // Highest current sortOrder — append new photos after it.
  const last = await prisma.servicePhoto.findFirst({
    where: { serviceId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  let nextSort = (last?.sortOrder ?? -1) + 1

  const created: Array<{ id: number; url: string; sortOrder: number }> = []

  for (const file of files) {
    const buffer = await sharp(file.buffer)
      .rotate() // honour EXIF orientation
      .resize({
        width: PHOTO_MAX_DIMENSION,
        height: PHOTO_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true })
      .toBuffer()

    const objectName = `services/${serviceId}/photo-${randomUUID()}.jpg`
    const url = await uploadFile(objectName, buffer, 'image/jpeg')

    const photo = await prisma.servicePhoto.create({
      data: { serviceId, url, sortOrder: nextSort },
      select: { id: true, url: true, sortOrder: true },
    })
    created.push(photo)
    nextSort++
  }

  await logAudit({
    userId,
    action: 'service.photos.upload',
    entity: 'service',
    entityId: serviceId,
    details: JSON.stringify({ count: created.length }),
    ipAddress: req.ip,
  })

  res.status(201).json({ data: created })
})

/**
 * DELETE /api/services/:serviceId/photos/:photoId
 */
export const deletePhoto = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  const photoId = parseId(req.params.photoId)
  await loadOwnedService(serviceId, userId)

  const photo = await prisma.servicePhoto.findFirst({
    where: { id: photoId, serviceId },
  })
  if (!photo) throw new AppError(404, 'Foto não encontrada', 'PHOTO_NOT_FOUND')

  // Extract MinIO object name from stored URL (format: /{bucket}/{objectName})
  const objectName = photo.url.replace(/^\/[^/]+\//, '')
  await deleteFile(objectName).catch(() => {
    // Best-effort — don't block DB deletion if MinIO is momentarily unavailable.
  })

  await prisma.servicePhoto.delete({ where: { id: photoId } })

  await logAudit({
    userId,
    action: 'service.photos.delete',
    entity: 'service',
    entityId: serviceId,
    details: JSON.stringify({ photoId }),
    ipAddress: req.ip,
  })

  res.status(204).send()
})

// ─────────────────────────────────────────────────────────────────────
// Public endpoints (no auth required)
// ─────────────────────────────────────────────────────────────────────

/**
 * Haversine distance in kilometres between two WGS-84 points.
 * Used for post-filter of the radius parameter. DB-level filtering by
 * bounding box is handled separately (see `latLngBoxFor`).
 */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Build a lat/lng bounding box around (lat, lng) of ~radiusKm in each
 * direction. Latitude degrees are ~111km, longitude degrees contract
 * by cos(lat). Use this to pre-filter in the DB before the exact
 * Haversine check.
 */
function latLngBoxFor(lat: number, lng: number, radiusKm: number) {
  const deltaLat = radiusKm / 111
  const deltaLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1)
  return {
    minLat: lat - deltaLat,
    maxLat: lat + deltaLat,
    minLng: lng - deltaLng,
    maxLng: lng + deltaLng,
  }
}

function publicServicePublicSelect() {
  return {
    id: true,
    providerId: true,
    categoryId: true,
    title: true,
    description: true,
    priceCents: true,
    priceUnit: true,
    currency: true,
    districtId: true,
    municipalityId: true,
    latitude: true,
    longitude: true,
    serviceRadiusKm: true,
    website: true,
    phone: true,
    avgRating: true,
    reviewCount: true,
    publishedAt: true,
    createdAt: true,
    photos: {
      select: { id: true, url: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' as const },
    },
    category: { select: { id: true, nameSlug: true, namePt: true } },
    district: { select: { id: true, namePt: true } },
    municipality: { select: { id: true, namePt: true } },
    provider: {
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    },
  }
}

/**
 * GET /api/services
 * Public listing. Returns only ACTIVE services. All filters are optional.
 *
 * Geographic filtering (lat/lng/radiusKm) is applied in two stages:
 *   1. Coarse bbox filter at the SQL level (uses the latitude/longitude index).
 *   2. Exact Haversine distance check in JS after the query.
 *
 * This is good enough for national-scale use and avoids PostGIS.
 */
export const listServices = asyncHandler(async (req, res) => {
  const q = req.query as unknown as ListServicesQuery

  // Radius filter: require all three coordinates together.
  const radiusFilterActive = q.lat !== undefined && q.lng !== undefined && q.radiusKm !== undefined

  // sort='distance' so e' aceitavel quando temos um ponto de referencia.
  if (q.sort === 'distance' && !radiusFilterActive) {
    throw new AppError(
      400,
      'Para ordenar por distância, indique a sua localização e um raio.',
      'DISTANCE_SORT_REQUIRES_RADIUS',
    )
  }

  const where: Prisma.ServiceWhereInput = { status: 'ACTIVE' }
  if (q.categoryId) where.categoryId = q.categoryId
  if (q.districtId) where.districtId = q.districtId
  if (q.municipalityId) where.municipalityId = q.municipalityId
  if (q.priceMin !== undefined || q.priceMax !== undefined) {
    where.priceCents = {}
    if (q.priceMin !== undefined) (where.priceCents as Prisma.IntFilter).gte = q.priceMin
    if (q.priceMax !== undefined) (where.priceCents as Prisma.IntFilter).lte = q.priceMax
  }
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
    ]
  }
  if (radiusFilterActive) {
    const box = latLngBoxFor(q.lat!, q.lng!, q.radiusKm!)
    where.latitude = { gte: box.minLat, lte: box.maxLat, not: null }
    where.longitude = { gte: box.minLng, lte: box.maxLng, not: null }
  }

  // Quando ordenamos por distancia, o orderBy SQL e' irrelevante — vamos
  // re-ordenar em JS depois do Haversine. Cai no default 'recent' so' para
  // ter um criterio estavel ate a' re-ordenacao.
  const orderBy: Prisma.ServiceOrderByWithRelationInput = (() => {
    switch (q.sort) {
      case 'price_asc':
        return { priceCents: 'asc' }
      case 'price_desc':
        return { priceCents: 'desc' }
      case 'rating':
        return { avgRating: 'desc' }
      case 'distance':
      case 'recent':
      default:
        return { publishedAt: 'desc' }
    }
  })()

  // When a radius filter is active, we over-fetch and post-filter in JS.
  // Using a wide cap (5x limit) keeps results correct without paginating
  // inside the bounding box. For portugal-scale listings this is safe.
  const fetchLimit = radiusFilterActive ? Math.max(q.limit * 5, 100) : q.limit
  const skip = radiusFilterActive ? 0 : (q.page - 1) * q.limit

  const [rowsRaw, totalRaw] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy,
      skip,
      take: fetchLimit,
      select: publicServicePublicSelect(),
    }),
    prisma.service.count({ where }),
  ])

  type Row = (typeof rowsRaw)[number]
  type RowWithDistance = Row & { distanceKm: number | null }

  let rows: RowWithDistance[] = rowsRaw.map((r) => ({ ...r, distanceKm: null }))
  let total = totalRaw

  if (radiusFilterActive) {
    // Anota cada linha com a distancia exacta. Round a 1 casa decimal:
    // suficiente para ordenar e para a UI ("3.4 km").
    const annotated = rows
      .map((s) => {
        if (s.latitude === null || s.longitude === null) return null
        const d = distanceKm(q.lat!, q.lng!, s.latitude, s.longitude)
        if (d > q.radiusKm!) return null
        return { ...s, distanceKm: Math.round(d * 10) / 10 }
      })
      .filter((s): s is RowWithDistance & { distanceKm: number } => s !== null)

    if (q.sort === 'distance') {
      annotated.sort((a, b) => a.distanceKm - b.distanceKm)
    }

    total = annotated.length
    const start = (q.page - 1) * q.limit
    rows = annotated.slice(start, start + q.limit)
  }

  res.json(paginatedResponse(rows, total, q.page, q.limit))
})

/**
 * GET /api/services/map
 * Lightweight payload for map markers. No pagination; filtered by bbox.
 */
export const mapServices = asyncHandler(async (req, res) => {
  const q = req.query as unknown as MapServicesQuery

  const where: Prisma.ServiceWhereInput = {
    status: 'ACTIVE',
    latitude: { not: null },
    longitude: { not: null },
  }
  if (q.categoryId) where.categoryId = q.categoryId
  if (q.districtId) where.districtId = q.districtId
  if (q.municipalityId) where.municipalityId = q.municipalityId
  if (q.priceMin !== undefined || q.priceMax !== undefined) {
    where.priceCents = {}
    if (q.priceMin !== undefined) (where.priceCents as Prisma.IntFilter).gte = q.priceMin
    if (q.priceMax !== undefined) (where.priceCents as Prisma.IntFilter).lte = q.priceMax
  }
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
    ]
  }
  if (
    q.minLat !== undefined &&
    q.maxLat !== undefined &&
    q.minLng !== undefined &&
    q.maxLng !== undefined
  ) {
    where.latitude = { gte: q.minLat, lte: q.maxLat, not: null }
    where.longitude = { gte: q.minLng, lte: q.maxLng, not: null }
  }

  const rows = await prisma.service.findMany({
    where,
    take: q.limit,
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      priceCents: true,
      priceUnit: true,
      latitude: true,
      longitude: true,
      category: { select: { id: true, nameSlug: true, namePt: true } },
    },
  })

  res.json({ data: rows, total: rows.length })
})

/**
 * GET /api/services/:serviceId
 * Public detail. Only ACTIVE services are exposed.
 */
export const getServiceById = asyncHandler(async (req, res) => {
  const serviceId = parseId(req.params.serviceId)

  const service = await prisma.service.findFirst({
    where: { id: serviceId, status: 'ACTIVE' },
    select: publicServicePublicSelect(),
  })
  if (!service) throw new AppError(404, 'Anúncio não encontrado', 'SERVICE_NOT_FOUND')

  res.json(service)
})

/**
 * GET /api/services/categories
 * Active categories only (the UI whitelist).
 */
export const listActiveCategories = asyncHandler(async (_req, res) => {
  const categories = await prisma.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: { namePt: 'asc' },
    select: { id: true, nameSlug: true, namePt: true },
  })
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(categories)
})

// ─────────────────────────────────────────────────────────────────────
// Contact (polymorphic Thread: service branch)
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/services/:serviceId/contact
 * Creates (or reuses) a Thread with serviceId set and posts the first message.
 * The service provider is derived from Service.providerId.
 *
 * Rules:
 *   - Requires auth (requireAuth on the router).
 *   - Sender cannot be the service provider (no self-contact).
 *   - Service must be ACTIVE.
 *   - Unique (ownerId, serviceId) — upsert semantics.
 */
export const contactService = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  const { subject, body } = req.body as ContactServiceInput

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      providerId: true,
      status: true,
      title: true,
      provider: { select: { isActive: true, suspendedAt: true } },
    },
  })
  if (!service) throw new AppError(404, 'Anúncio não encontrado', 'SERVICE_NOT_FOUND')
  if (service.status !== 'ACTIVE') {
    throw new AppError(400, 'Este anúncio não está activo', 'SERVICE_NOT_ACTIVE')
  }
  if (service.providerId === userId) {
    throw new AppError(400, 'Não pode contactar o seu próprio anúncio', 'SELF_CONTACT')
  }
  if (!service.provider.isActive || service.provider.suspendedAt) {
    throw new AppError(400, 'Este prestador não está a receber mensagens', 'PROVIDER_UNAVAILABLE')
  }

  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.thread.upsert({
      where: { ownerId_serviceId: { ownerId: userId, serviceId } },
      create: { ownerId: userId, serviceId, subject },
      update: { updatedAt: new Date() },
    })
    const created = thread.createdAt.getTime() === thread.updatedAt.getTime()
    const message = await tx.message.create({
      data: { threadId: thread.id, senderId: userId, body },
    })
    if (!created) {
      await tx.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } })
    }
    return { thread, message, created }
  })

  await logAudit({
    userId,
    action: result.created ? 'service.contact.thread_created' : 'service.contact.message_sent',
    entity: result.created ? 'thread' : 'message',
    entityId: result.created ? result.thread.id : result.message.id,
    details: `Service ${serviceId}: ${service.title}`,
    ipAddress: req.ip,
  })

  res.status(201).json({
    threadId: result.thread.id,
    created: result.created,
    message: result.message,
  })
})

// ─────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/services/:serviceId/report
 * Users may report any service (ACTIVE or otherwise, except the ones they own).
 * Deduplicates pending reports from the same reporter.
 */
export const reportService = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const serviceId = parseId(req.params.serviceId)
  const { reason } = req.body as ReportServiceInput

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, providerId: true },
  })
  if (!service) throw new AppError(404, 'Anúncio não encontrado', 'SERVICE_NOT_FOUND')
  if (service.providerId === userId) {
    throw new AppError(400, 'Não pode denunciar o próprio anúncio', 'SELF_REPORT')
  }

  // Dedupe pending reports by this reporter.
  // Usamos try/catch sobre o unique composto (serviceId, reporterId, status)
  // em vez de findFirst+create para eliminar a race condition entre pedidos
  // concorrentes. O unique foi adicionado em schema.prisma.
  let report: { id: number; createdAt: Date; status: 'PENDING' | 'RESOLVED' | 'DISMISSED' }
  try {
    report = await prisma.serviceReport.create({
      data: { serviceId, reporterId: userId, reason },
      select: { id: true, createdAt: true, status: true },
    })
  } catch (err) {
    // P2002 = unique constraint violation → denuncia PENDING ja existe.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.serviceReport.findFirst({
        where: { serviceId, reporterId: userId, status: 'PENDING' },
        select: { id: true },
      })
      if (existing) {
        res.status(200).json({ id: existing.id, duplicate: true })
        return
      }
    }
    throw err
  }

  await logAudit({
    userId,
    action: 'service.report.create',
    entity: 'service_report',
    entityId: report.id,
    details: `Service ${serviceId} | Reason: ${reason.slice(0, 80)}`,
    ipAddress: req.ip,
  })

  res.status(201).json(report)
})
