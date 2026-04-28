// ============================================
// PataCerta — Admin Sponsored Slots Controller
// ============================================
//
// CRUD de slots patrocinados. Restrito a ADMIN (router enforces).
// Fase beta: tracking apenas, sem cobrança — admin define manualmente
// que criadores ficam destacados em que raças durante que janela.

import { prisma } from '../../lib/prisma.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { AppError } from '../../middleware/error-handler.js'
import { logAudit } from '../../lib/audit.js'
import type {
  CreateSponsoredSlotInput,
  ListSponsoredSlotsInput,
  UpdateSponsoredSlotInput,
} from '@patacerta/shared'
import { Prisma } from '@prisma/client'

const SLOT_INCLUDE = {
  breeder: {
    select: {
      id: true,
      businessName: true,
      status: true,
      district: { select: { id: true, namePt: true } },
    },
  },
  breed: {
    select: { id: true, nameSlug: true, namePt: true },
  },
}

export const listSponsoredSlots = asyncHandler(async (req, res) => {
  const { breedId, breederId, status, page, limit } =
    req.query as unknown as ListSponsoredSlotsInput

  const where: Prisma.SponsoredBreedSlotWhereInput = {}
  if (breedId) where.breedId = breedId
  if (breederId) where.breederId = breederId
  if (status) where.status = status

  const [slots, total] = await Promise.all([
    prisma.sponsoredBreedSlot.findMany({
      where,
      include: SLOT_INCLUDE,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ status: 'asc' }, { startsAt: 'desc' }],
    }),
    prisma.sponsoredBreedSlot.count({ where }),
  ])

  res.json(paginatedResponse(slots, total, page, limit))
})

export const createSponsoredSlot = asyncHandler(async (req, res) => {
  const data = req.body as CreateSponsoredSlotInput

  // Valida que o criador existe e está VERIFIED — só verified pode
  // ser destacado (alinhado com restantes filtros públicos).
  const breeder = await prisma.breeder.findUnique({
    where: { id: data.breederId },
    select: { id: true, status: true },
  })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.status !== 'VERIFIED') {
    throw new AppError(
      400,
      'Apenas criadores verificados podem ter slots patrocinados',
      'BREEDER_NOT_VERIFIED',
    )
  }

  // Valida que a raça existe.
  const breed = await prisma.breed.findUnique({
    where: { id: data.breedId },
    select: { id: true },
  })
  if (!breed) throw new AppError(404, 'Raça não encontrada', 'BREED_NOT_FOUND')

  const slot = await prisma.sponsoredBreedSlot.create({
    data: {
      breederId: data.breederId,
      breedId: data.breedId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      notes: data.notes,
    },
    include: SLOT_INCLUDE,
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'sponsored_slot.create',
    entity: 'sponsored_slot',
    entityId: slot.id,
    details: JSON.stringify({
      breederId: slot.breederId,
      breedId: slot.breedId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    }),
    ipAddress: req.ip,
  })

  res.status(201).json(slot)
})

export const updateSponsoredSlot = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const data = req.body as UpdateSponsoredSlotInput

  const existing = await prisma.sponsoredBreedSlot.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Slot não encontrado', 'SLOT_NOT_FOUND')

  // Coerência startsAt/endsAt face ao registo existente quando só um vem.
  const finalStarts = data.startsAt ?? existing.startsAt
  const finalEnds = data.endsAt ?? existing.endsAt
  if (finalEnds.getTime() <= finalStarts.getTime()) {
    throw new AppError(
      400,
      'A data de fim tem de ser posterior à data de início',
      'INVALID_DATE_RANGE',
    )
  }

  const updateData: Prisma.SponsoredBreedSlotUpdateInput = {}
  if (data.startsAt !== undefined) updateData.startsAt = data.startsAt
  if (data.endsAt !== undefined) updateData.endsAt = data.endsAt
  if (data.status !== undefined) updateData.status = data.status
  if (data.notes !== undefined) updateData.notes = data.notes

  const slot = await prisma.sponsoredBreedSlot.update({
    where: { id },
    data: updateData,
    include: SLOT_INCLUDE,
  })

  await logAudit({
    userId: req.user!.userId,
    action: 'sponsored_slot.update',
    entity: 'sponsored_slot',
    entityId: slot.id,
    details: JSON.stringify(data),
    ipAddress: req.ip,
  })

  res.json(slot)
})

export const deleteSponsoredSlot = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  const existing = await prisma.sponsoredBreedSlot.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Slot não encontrado', 'SLOT_NOT_FOUND')

  await prisma.sponsoredBreedSlot.delete({ where: { id } })

  await logAudit({
    userId: req.user!.userId,
    action: 'sponsored_slot.delete',
    entity: 'sponsored_slot',
    entityId: id,
    details: JSON.stringify({
      breederId: existing.breederId,
      breedId: existing.breedId,
    }),
    ipAddress: req.ip,
  })

  res.status(204).send()
})
