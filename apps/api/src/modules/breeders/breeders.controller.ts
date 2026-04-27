import type { Request, Response } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, getBreederForUser } from '../../lib/helpers.js'
import { uploadFile, deleteFile } from '../../lib/minio.js'
import { logAudit } from '../../lib/audit.js'
import { Prisma } from '@prisma/client'
import type { BreederProfileInput, ReorderBreederPhotosInput } from '@patacerta/shared'

const MAX_PHOTOS_PER_BREEDER = 10
const PHOTO_MAX_DIMENSION = 1600
const PHOTO_JPEG_QUALITY = 85

const BREEDER_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  district: { select: { id: true, namePt: true, latitude: true, longitude: true } },
  municipality: { select: { id: true, namePt: true } },
  species: { include: { species: { select: { id: true, namePt: true, nameSlug: true } } } },
  photos: {
    select: { id: true, url: true, caption: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
}

/**
 * Campos opcionais que o criador pode actualizar e que sao copiados
 * directamente do body para o updateData se vierem definidos.
 * Mantem o updateMyBreederProfile curto e evita esquecer campos.
 */
const OPTIONAL_BREEDER_FIELDS = [
  'description',
  'website',
  'phone',
  'youtubeVideoId',
  'cpcMember',
  'fciAffiliated',
  'vetCheckup',
  'microchip',
  'vaccinations',
  'lopRegistry',
  'kennelName',
  'salesInvoice',
  'food',
  'initialTraining',
  'pickupInPerson',
  'deliveryByCar',
  'deliveryByPlane',
  'pickupNotes',
] as const

// Auto-promove OWNER -> BREEDER quando cria o primeiro perfil de criador.
// Admin e SERVICE_PROVIDER mantem o role actual (caso seja SP que tambem
// quer ter perfil de criador, fica como SP — permissoes derivam de
// ter-perfil/ter-servico, nao do role).
async function promoteToBreederIfNeeded(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user) return
  if (user.role === 'OWNER') {
    await prisma.user.update({ where: { id: userId }, data: { role: 'BREEDER' } })
  }
}

export const getBreederById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const [breeder, ratingAgg] = await Promise.all([
    prisma.breeder.findUnique({ where: { id }, include: BREEDER_INCLUDE }),
    prisma.review.aggregate({
      where: { breederId: id, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { id: true },
    }),
  ])

  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.status !== 'VERIFIED')
    throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')

  const avg = ratingAgg._avg.rating
  res.json({
    ...breeder,
    avgRating: avg !== null ? Math.round(avg * 10) / 10 : null,
    reviewCount: ratingAgg._count.id,
  })
})

export const createBreederProfile = asyncHandler(async (req, res) => {
  const data = req.body as BreederProfileInput
  const userId = req.user!.userId

  const existing = await prisma.breeder.findUnique({ where: { userId } })
  if (existing) throw new AppError(409, 'Já possui um perfil de criador', 'BREEDER_EXISTS')

  const nifExists = await prisma.breeder.findFirst({ where: { nif: data.nif } })
  if (nifExists) throw new AppError(409, 'Este NIF já está registado', 'NIF_EXISTS')

  const dgavExists = await prisma.breeder.findFirst({ where: { dgavNumber: data.dgavNumber } })
  if (dgavExists) throw new AppError(409, 'Este número DGAV já está registado', 'DGAV_EXISTS')

  const district = await prisma.district.findUnique({ where: { id: data.districtId } })
  if (!district) throw new AppError(400, 'Distrito não encontrado', 'INVALID_DISTRICT')

  const municipality = await prisma.municipality.findFirst({
    where: { id: data.municipalityId, districtId: data.districtId },
  })
  if (!municipality)
    throw new AppError(400, 'Concelho não pertence ao distrito', 'INVALID_MUNICIPALITY')

  const speciesCount = await prisma.species.count({ where: { id: { in: data.speciesIds } } })
  if (speciesCount !== data.speciesIds.length)
    throw new AppError(400, 'Uma ou mais espécies selecionadas são inválidas', 'INVALID_SPECIES')

  let breeder
  try {
    breeder = await prisma.breeder.create({
      data: {
        userId,
        businessName: data.businessName,
        nif: data.nif,
        dgavNumber: data.dgavNumber,
        description: data.description,
        website: data.website,
        phone: data.phone,
        districtId: data.districtId,
        municipalityId: data.municipalityId,
        species: { create: data.speciesIds.map((speciesId) => ({ speciesId })) },
      },
      include: BREEDER_INCLUDE,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? []
      if (target.includes('dgav_number'))
        throw new AppError(409, 'Este número DGAV já está registado', 'DGAV_EXISTS')
      throw new AppError(409, 'Este NIF já está registado', 'NIF_EXISTS')
    }
    throw err
  }

  await promoteToBreederIfNeeded(userId)

  res.status(201).json(breeder)
})

export const updateMyBreederProfile = asyncHandler(async (req, res) => {
  const breeder = await getBreederForUser(req.user!.userId)
  const data = req.body

  // Block verified field changes after verification
  const VERIFIED_FIELDS = ['nif', 'businessName', 'dgavNumber'] as const
  if (breeder.status === 'VERIFIED' || breeder.status === 'PENDING_VERIFICATION') {
    if (VERIFIED_FIELDS.some((f) => data[f] !== undefined)) {
      throw new AppError(
        400,
        'Não é possível alterar NIF, nome da empresa ou número DGAV após verificação. Contacte o suporte.',
        'VERIFIED_FIELD_LOCKED',
      )
    }
  }

  const updateData: Record<string, unknown> = {}
  if (data.businessName !== undefined) updateData.businessName = data.businessName
  if (data.nif !== undefined) {
    const nifExists = await prisma.breeder.findFirst({
      where: { nif: data.nif, id: { not: breeder.id } },
    })
    if (nifExists) throw new AppError(409, 'Este NIF já está registado', 'NIF_EXISTS')
    updateData.nif = data.nif
  }
  if (data.dgavNumber !== undefined) {
    const dgavExists = await prisma.breeder.findFirst({
      where: { dgavNumber: data.dgavNumber, id: { not: breeder.id } },
    })
    if (dgavExists) throw new AppError(409, 'Este número DGAV já está registado', 'DGAV_EXISTS')
    updateData.dgavNumber = data.dgavNumber
  }
  for (const field of OPTIONAL_BREEDER_FIELDS) {
    if (data[field] !== undefined) updateData[field] = data[field]
  }

  // Validate district/municipality on update
  if (data.districtId !== undefined || data.municipalityId !== undefined) {
    const districtId = data.districtId ?? breeder.districtId
    const municipalityId = data.municipalityId ?? breeder.municipalityId
    const municipality = await prisma.municipality.findFirst({
      where: { id: municipalityId, districtId },
    })
    if (!municipality)
      throw new AppError(400, 'Concelho não pertence ao distrito', 'INVALID_MUNICIPALITY')
    if (data.districtId !== undefined) updateData.districtId = data.districtId
    if (data.municipalityId !== undefined) updateData.municipalityId = data.municipalityId
  }

  // Transactional species sync
  if (data.speciesIds !== undefined) {
    if (Array.isArray(data.speciesIds) && data.speciesIds.length === 0) {
      throw new AppError(400, 'Selecione pelo menos uma espécie', 'EMPTY_SPECIES')
    }
    const speciesCount = await prisma.species.count({ where: { id: { in: data.speciesIds } } })
    if (speciesCount !== data.speciesIds.length)
      throw new AppError(400, 'Uma ou mais espécies selecionadas são inválidas', 'INVALID_SPECIES')

    const updated = await prisma.$transaction(async (tx) => {
      await tx.breederSpecies.deleteMany({ where: { breederId: breeder.id } })
      await tx.breederSpecies.createMany({
        data: data.speciesIds.map((speciesId: number) => ({ breederId: breeder.id, speciesId })),
      })
      return tx.breeder.update({
        where: { id: breeder.id },
        data: updateData,
        include: BREEDER_INCLUDE,
      })
    })
    res.json(updated)
    return
  }

  const updated = await prisma.breeder.update({
    where: { id: breeder.id },
    data: updateData,
    include: BREEDER_INCLUDE,
  })
  res.json(updated)
})

export const getMyBreederProfile = asyncHandler(async (req, res) => {
  const breeder = await prisma.breeder.findUnique({
    where: { userId: req.user!.userId },
    include: {
      ...BREEDER_INCLUDE,
      verificationDocs: {
        select: { id: true, docType: true, status: true, fileName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!breeder) throw new AppError(404, 'Perfil de criador não encontrado', 'BREEDER_NOT_FOUND')
  res.json(breeder)
})

export const submitForVerification = asyncHandler(async (req, res) => {
  const breeder = await prisma.breeder.findUnique({
    where: { userId: req.user!.userId },
    include: { verificationDocs: true },
  })
  if (!breeder) throw new AppError(404, 'Perfil de criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.status === 'VERIFIED')
    throw new AppError(400, 'Perfil já verificado', 'ALREADY_VERIFIED')
  if (breeder.status === 'PENDING_VERIFICATION')
    throw new AppError(400, 'Já submetido para verificação', 'ALREADY_PENDING')
  if (breeder.status === 'SUSPENDED')
    throw new AppError(403, 'Perfil suspenso — contacte o suporte', 'BREEDER_SUSPENDED')

  if (breeder.verificationDocs.length === 0) {
    throw new AppError(400, 'Envie pelo menos um documento antes de submeter', 'NO_DOCUMENTS')
  }

  const hasDgavDoc = breeder.verificationDocs.some((d) => d.docType === 'DGAV')
  if (!hasDgavDoc) {
    throw new AppError(
      400,
      'Envie o certificado DGAV antes de submeter o perfil para verificação',
      'DGAV_DOC_REQUIRED',
    )
  }

  const updated = await prisma.breeder.update({
    where: { id: breeder.id },
    data: { status: 'PENDING_VERIFICATION' },
    select: { id: true, status: true },
  })
  res.json(updated)
})

// ─── Photos (gallery) ────────────────────────────────────────────────
//
// Espelha o padrao de services.controller: multer memoryStorage 2MB,
// sharp resize 1600px max + JPEG q85, MinIO uploadFile, sortOrder
// incremental. Maximo 10 fotos por criador.

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: MAX_PHOTOS_PER_BREEDER,
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
}).array('photos', MAX_PHOTOS_PER_BREEDER)

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
                `Máximo ${MAX_PHOTOS_PER_BREEDER} fotos por criador`,
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

/**
 * POST /api/breeders/me/photos
 * multipart/form-data, campo "photos" (1..10 ficheiros).
 */
export const uploadBreederPhotos = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const breeder = await getBreederForUser(userId)

  await runPhotoMulter(req, res)

  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length === 0) {
    throw new AppError(400, 'Nenhuma foto enviada', 'NO_FILES')
  }

  const existingCount = await prisma.breederPhoto.count({ where: { breederId: breeder.id } })
  if (existingCount + files.length > MAX_PHOTOS_PER_BREEDER) {
    throw new AppError(
      400,
      `Máximo ${MAX_PHOTOS_PER_BREEDER} fotos por criador (tem ${existingCount})`,
      'TOO_MANY_PHOTOS',
    )
  }

  const last = await prisma.breederPhoto.findFirst({
    where: { breederId: breeder.id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  let nextSort = (last?.sortOrder ?? -1) + 1

  const created: Array<{ id: number; url: string; caption: string | null; sortOrder: number }> = []

  for (const file of files) {
    const buffer = await sharp(file.buffer)
      .rotate()
      .resize({
        width: PHOTO_MAX_DIMENSION,
        height: PHOTO_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true })
      .toBuffer()

    const objectName = `breeders/${breeder.id}/photo-${randomUUID()}.jpg`
    const url = await uploadFile(objectName, buffer, 'image/jpeg')

    const photo = await prisma.breederPhoto.create({
      data: { breederId: breeder.id, url, sortOrder: nextSort },
      select: { id: true, url: true, caption: true, sortOrder: true },
    })
    created.push(photo)
    nextSort++
  }

  await logAudit({
    userId,
    action: 'breeder.photos.upload',
    entity: 'breeder',
    entityId: breeder.id,
    details: JSON.stringify({ count: created.length }),
    ipAddress: req.ip,
  })

  res.status(201).json({ data: created })
})

/**
 * DELETE /api/breeders/me/photos/:photoId
 */
export const deleteBreederPhoto = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const breeder = await getBreederForUser(userId)
  const photoId = parseId(req.params.photoId)

  const photo = await prisma.breederPhoto.findFirst({
    where: { id: photoId, breederId: breeder.id },
  })
  if (!photo) throw new AppError(404, 'Foto não encontrada', 'PHOTO_NOT_FOUND')

  const objectName = photo.url.replace(/^\/[^/]+\//, '')
  await deleteFile(objectName).catch(() => {
    // Best-effort
  })

  await prisma.breederPhoto.delete({ where: { id: photoId } })

  await logAudit({
    userId,
    action: 'breeder.photos.delete',
    entity: 'breeder',
    entityId: breeder.id,
    details: JSON.stringify({ photoId }),
    ipAddress: req.ip,
  })

  res.status(204).send()
})

/**
 * PATCH /api/breeders/me/photos/reorder
 */
export const reorderBreederPhotos = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const breeder = await getBreederForUser(userId)

  const { photoIds } = req.body as ReorderBreederPhotosInput

  const uniqueIds = new Set(photoIds)
  if (uniqueIds.size !== photoIds.length) {
    throw new AppError(400, 'A lista de fotos contém duplicados.', 'PHOTOS_REORDER_DUPLICATES')
  }

  const existing = await prisma.breederPhoto.findMany({
    where: { breederId: breeder.id },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((p) => p.id))

  if (existing.length !== photoIds.length) {
    throw new AppError(
      400,
      'A lista não corresponde às fotos actuais. Recarregue a página.',
      'PHOTOS_REORDER_MISMATCH',
    )
  }
  for (const id of photoIds) {
    if (!existingIds.has(id)) {
      throw new AppError(
        400,
        'A lista contém fotos que não pertencem a este criador.',
        'PHOTOS_REORDER_INVALID_ID',
      )
    }
  }

  await prisma.$transaction(
    photoIds.map((id, idx) =>
      prisma.breederPhoto.update({
        where: { id },
        data: { sortOrder: idx },
      }),
    ),
  )

  await logAudit({
    userId,
    action: 'breeder.photos.reorder',
    entity: 'breeder',
    entityId: breeder.id,
    details: JSON.stringify({ count: photoIds.length }),
    ipAddress: req.ip,
  })

  const updated = await prisma.breederPhoto.findMany({
    where: { breederId: breeder.id },
    select: { id: true, url: true, caption: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  })

  res.json({ data: updated })
})
