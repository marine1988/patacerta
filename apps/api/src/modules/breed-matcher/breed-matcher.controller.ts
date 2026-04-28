// ============================================
// PataCerta — Breed Matcher Controller
// ============================================
//
// POST /api/breed-matcher/match
//
// Recebe respostas do quiz, corre o algoritmo de scoring sobre todas
// as raças (~104 hoje), devolve top 5 com score 0-100 e highlights
// legíveis. Stateless — não persiste respostas.
//
// Slots patrocinados: para cada raça do top 5, vamos buscar até 3
// `SponsoredBreedSlot` com `status='ACTIVE'` dentro da janela
// [startsAt, endsAt] e cujo criador esteja `VERIFIED`. Se houver
// mais que 3, embaralhamos para rotação justa entre campanhas. As
// impressões são incrementadas best-effort (não-transaccional).

import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'
import type { BreedMatchInput, BreedMatchResult, SponsoredBreederMini } from '@patacerta/shared'
import { scoreBreed, penaltyToScore, type BreedForMatch } from './scoring.js'

const MAX_SPONSORED_PER_BREED = 3

/**
 * Vai buscar até `MAX_SPONSORED_PER_BREED` criadores patrocinados por
 * cada `breedId` recebido. Devolve um Map para JOIN no chamador.
 * Best-effort: erros aqui não devem falhar o `/match` — apanhamos e
 * devolvemos Map vazio.
 */
async function fetchSponsoredByBreed(
  breedIds: number[],
): Promise<Map<number, SponsoredBreederMini[]>> {
  const result = new Map<number, SponsoredBreederMini[]>()
  if (breedIds.length === 0) return result

  try {
    const now = new Date()
    const slots = await prisma.sponsoredBreedSlot.findMany({
      where: {
        breedId: { in: breedIds },
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gte: now },
        breeder: { status: 'VERIFIED' },
      },
      include: {
        breeder: {
          select: {
            id: true,
            businessName: true,
            district: { select: { id: true, namePt: true } },
            municipality: { select: { id: true, namePt: true } },
            photos: {
              select: { url: true, sortOrder: true },
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
            reviews: {
              where: { status: 'PUBLISHED' },
              select: { rating: true },
            },
          },
        },
      },
    })

    // Agrupa por breedId
    const grouped = new Map<number, typeof slots>()
    for (const s of slots) {
      const list = grouped.get(s.breedId) ?? []
      list.push(s)
      grouped.set(s.breedId, list)
    }

    // Embaralha + corta + mapeia
    for (const [breedId, list] of grouped) {
      const shuffled = [...list].sort(() => Math.random() - 0.5).slice(0, MAX_SPONSORED_PER_BREED)
      const mini: SponsoredBreederMini[] = shuffled.map((s) => {
        const ratings = s.breeder.reviews.map((r) => r.rating)
        const avgRating =
          ratings.length > 0
            ? Math.round((ratings.reduce((a, c) => a + c, 0) / ratings.length) * 10) / 10
            : null
        return {
          slotId: s.id,
          breederId: s.breeder.id,
          businessName: s.breeder.businessName,
          district: s.breeder.district,
          municipality: s.breeder.municipality,
          avgRating,
          reviewCount: ratings.length,
          coverPhotoUrl: s.breeder.photos[0]?.url ?? null,
        }
      })
      result.set(breedId, mini)

      // Impression tracking — best-effort, não bloqueia resposta.
      // Incrementa só os slots realmente devolvidos (após shuffle/slice).
      const shownIds = shuffled.map((s) => s.id)
      if (shownIds.length > 0) {
        prisma.sponsoredBreedSlot
          .updateMany({
            where: { id: { in: shownIds } },
            data: { impressionCount: { increment: 1 } },
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[breed-matcher] impression increment failed', err)
          })
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[breed-matcher] fetchSponsoredByBreed failed', err)
  }

  return result
}

export const matchBreeds = asyncHandler(async (req, res) => {
  const input = req.body as BreedMatchInput

  const breeds = await prisma.breed.findMany()

  if (breeds.length === 0) {
    res.json({ results: [], input })
    return
  }

  // Corre scoring em todas
  const scored = breeds.map((breed) => {
    const breedForMatch: BreedForMatch = {
      id: breed.id,
      size: breed.size,
      energyLevel: breed.energyLevel,
      exerciseDailyMin: breed.exerciseDailyMin,
      trainability: breed.trainability,
      groomingLevel: breed.groomingLevel,
      shedding: breed.shedding,
      hypoallergenic: breed.hypoallergenic,
      apartmentFriendly: breed.apartmentFriendly,
      noviceFriendly: breed.noviceFriendly,
      toleratesAlone: breed.toleratesAlone,
      goodWithKids: breed.goodWithKids,
      goodWithDogs: breed.goodWithDogs,
      goodWithStrangers: breed.goodWithStrangers,
      barkLevel: breed.barkLevel,
      coldTolerance: breed.coldTolerance,
      heatTolerance: breed.heatTolerance,
    }
    const outcome = scoreBreed(breedForMatch, input)
    return { breed, ...outcome }
  })

  const worstPenalty = Math.max(...scored.map((s) => s.penalty))

  // Top 5 por menor penalidade
  const top = scored.sort((a, b) => a.penalty - b.penalty).slice(0, 5)

  const sponsoredByBreed = await fetchSponsoredByBreed(top.map((s) => s.breed.id))

  const results: BreedMatchResult[] = top.map((s) => {
    // Mostra até 3 highlights — prefere positivos, completa com negativos
    const highlights = [...s.positives.slice(0, 2), ...s.negatives.slice(0, 1)].slice(0, 3)
    return {
      breed: {
        id: s.breed.id,
        nameSlug: s.breed.nameSlug,
        namePt: s.breed.namePt,
        fciGroup: s.breed.fciGroup,
        origin: s.breed.origin,
        summaryPt: s.breed.summaryPt,
        size: s.breed.size,
        weightMinKg: Number(s.breed.weightMinKg),
        weightMaxKg: Number(s.breed.weightMaxKg),
        lifespanMinYrs: s.breed.lifespanMinYrs,
        lifespanMaxYrs: s.breed.lifespanMaxYrs,
        energyLevel: s.breed.energyLevel,
        exerciseDailyMin: s.breed.exerciseDailyMin,
        trainability: s.breed.trainability,
        groomingLevel: s.breed.groomingLevel,
        apartmentFriendly: s.breed.apartmentFriendly,
        noviceFriendly: s.breed.noviceFriendly,
        hypoallergenic: s.breed.hypoallergenic,
        imageUrl: s.breed.imageUrl,
      },
      score: penaltyToScore(s.penalty, worstPenalty),
      highlights,
      sponsoredBreeders: sponsoredByBreed.get(s.breed.id) ?? [],
    }
  })

  res.json({ results, input })
})
