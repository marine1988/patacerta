// ============================================
// PataCerta — Services Controller (owner-side)
// ============================================
//
// Scope of this file (PR-2):
//   - Owner/provider CRUD of their own service listings.
//   - Status transitions: DRAFT → ACTIVE → PAUSED, ACTIVE/PAUSED → SUSPENDED (admin-only elsewhere).
//   - Photo management (multer + sharp resize, MinIO storage).
//   - Best-effort geocoding on create/update (via lib/geocoding).
//
// Public endpoints (listing, filters, contact, reports, admin moderation)
// live in later PRs.
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
import { asyncHandler, parseId } from '../../lib/helpers.js'
import { uploadFile, deleteFile } from '../../lib/minio.js'
import { logAudit } from '../../lib/audit.js'
import { geocodeService } from '../../lib/geocoding.js'
import {
  SERVICE_STATUS_TRANSITIONS,
  ServiceStatus,
  type CreateServiceInput,
  type UpdateServiceInput,
} from '@patacerta/shared'

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
  await prisma.serviceCoverage.deleteMany({ where: { serviceId } })
  if (municipalityIds.length === 0) return
  await prisma.serviceCoverage.createMany({
    data: municipalityIds.map((municipalityId) => ({ serviceId, municipalityId })),
    skipDuplicates: true,
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
 */
export const getMyServices = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const services = await prisma.service.findMany({
    where: { providerId: userId },
    orderBy: { updatedAt: 'desc' },
    select: publicServiceSelect(),
  })
  res.json({ data: services })
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
