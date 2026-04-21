import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, getBreederForUser } from '../../lib/helpers.js'
import { Prisma } from '@prisma/client'
import type { BreederProfileInput } from '@patacerta/shared'

const BREEDER_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  district: { select: { id: true, namePt: true } },
  municipality: { select: { id: true, namePt: true } },
  species: { include: { species: { select: { id: true, namePt: true, nameSlug: true } } } },
}

export const getBreederById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const breeder = await prisma.breeder.findUnique({
    where: { id },
    include: {
      ...BREEDER_INCLUDE,
      reviews: { where: { status: 'PUBLISHED' }, select: { rating: true } },
    },
  })

  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.status !== 'VERIFIED') throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')

  const ratings = breeder.reviews.map((r) => r.rating)
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  const { reviews: _reviews, ...rest } = breeder

  res.json({ ...rest, avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null, reviewCount: ratings.length })
})

export const createBreederProfile = asyncHandler(async (req, res) => {
  const data = req.body as BreederProfileInput
  const userId = req.user!.userId

  const existing = await prisma.breeder.findUnique({ where: { userId } })
  if (existing) throw new AppError(409, 'Já possui um perfil de criador', 'BREEDER_EXISTS')

  const nifExists = await prisma.breeder.findFirst({ where: { nif: data.nif } })
  if (nifExists) throw new AppError(409, 'Este NIF já está registado', 'NIF_EXISTS')

  const district = await prisma.district.findUnique({ where: { id: data.districtId } })
  if (!district) throw new AppError(400, 'Distrito não encontrado', 'INVALID_DISTRICT')

  const municipality = await prisma.municipality.findFirst({
    where: { id: data.municipalityId, districtId: data.districtId },
  })
  if (!municipality) throw new AppError(400, 'Concelho não pertence ao distrito', 'INVALID_MUNICIPALITY')

  const speciesCount = await prisma.species.count({ where: { id: { in: data.speciesIds } } })
  if (speciesCount !== data.speciesIds.length) throw new AppError(400, 'Uma ou mais espécies selecionadas são inválidas', 'INVALID_SPECIES')

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
      throw new AppError(409, 'Este NIF já está registado', 'NIF_EXISTS')
    }
    throw err
  }

  res.status(201).json(breeder)
})

export const updateMyBreederProfile = asyncHandler(async (req, res) => {
  const breeder = await getBreederForUser(req.user!.userId)
  const data = req.body

  // Block verified field changes after verification
  const VERIFIED_FIELDS = ['nif', 'businessName', 'dgavNumber'] as const
  if (breeder.status === 'VERIFIED' || breeder.status === 'PENDING_VERIFICATION') {
    if (VERIFIED_FIELDS.some((f) => data[f] !== undefined)) {
      throw new AppError(400, 'Não é possível alterar NIF, nome da empresa ou número DGAV após verificação. Contacte o suporte.', 'VERIFIED_FIELD_LOCKED')
    }
  }

  const updateData: Record<string, unknown> = {}
  if (data.businessName !== undefined) updateData.businessName = data.businessName
  if (data.nif !== undefined) {
    const nifExists = await prisma.breeder.findFirst({ where: { nif: data.nif, id: { not: breeder.id } } })
    if (nifExists) throw new AppError(409, 'Este NIF já está registado', 'NIF_EXISTS')
    updateData.nif = data.nif
  }
  if (data.dgavNumber !== undefined) updateData.dgavNumber = data.dgavNumber
  if (data.description !== undefined) updateData.description = data.description
  if (data.website !== undefined) updateData.website = data.website
  if (data.phone !== undefined) updateData.phone = data.phone

  // Validate district/municipality on update
  if (data.districtId !== undefined || data.municipalityId !== undefined) {
    const districtId = data.districtId ?? breeder.districtId
    const municipalityId = data.municipalityId ?? breeder.municipalityId
    const municipality = await prisma.municipality.findFirst({ where: { id: municipalityId, districtId } })
    if (!municipality) throw new AppError(400, 'Concelho não pertence ao distrito', 'INVALID_MUNICIPALITY')
    if (data.districtId !== undefined) updateData.districtId = data.districtId
    if (data.municipalityId !== undefined) updateData.municipalityId = data.municipalityId
  }

  // Transactional species sync
  if (data.speciesIds !== undefined) {
    if (Array.isArray(data.speciesIds) && data.speciesIds.length === 0) {
      throw new AppError(400, 'Selecione pelo menos uma espécie', 'EMPTY_SPECIES')
    }
    const speciesCount = await prisma.species.count({ where: { id: { in: data.speciesIds } } })
    if (speciesCount !== data.speciesIds.length) throw new AppError(400, 'Uma ou mais espécies selecionadas são inválidas', 'INVALID_SPECIES')

    const updated = await prisma.$transaction(async (tx) => {
      await tx.breederSpecies.deleteMany({ where: { breederId: breeder.id } })
      await tx.breederSpecies.createMany({
        data: data.speciesIds.map((speciesId: number) => ({ breederId: breeder.id, speciesId })),
      })
      return tx.breeder.update({ where: { id: breeder.id }, data: updateData, include: BREEDER_INCLUDE })
    })
    res.json(updated)
    return
  }

  const updated = await prisma.breeder.update({ where: { id: breeder.id }, data: updateData, include: BREEDER_INCLUDE })
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
  if (breeder.status === 'VERIFIED') throw new AppError(400, 'Perfil já verificado', 'ALREADY_VERIFIED')
  if (breeder.status === 'PENDING_VERIFICATION') throw new AppError(400, 'Já submetido para verificação', 'ALREADY_PENDING')
  if (breeder.status === 'SUSPENDED') throw new AppError(403, 'Perfil suspenso — contacte o suporte', 'BREEDER_SUSPENDED')

  if (breeder.verificationDocs.length === 0) {
    throw new AppError(400, 'Envie pelo menos um documento antes de submeter', 'NO_DOCUMENTS')
  }

  const updated = await prisma.breeder.update({
    where: { id: breeder.id },
    data: { status: 'PENDING_VERIFICATION' },
    select: { id: true, status: true },
  })
  res.json(updated)
})
