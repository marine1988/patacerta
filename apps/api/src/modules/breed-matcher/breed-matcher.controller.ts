// ============================================
// PataCerta — Breed Matcher Controller
// ============================================
//
// POST /api/breed-matcher/match
//
// Recebe respostas do quiz, corre o algoritmo de scoring sobre todas
// as raças (~40 hoje), devolve top 5 com score 0-100 e highlights
// legíveis. Stateless — não persiste respostas.

import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'
import type { BreedMatchInput, BreedMatchResult } from '@patacerta/shared'
import { scoreBreed, penaltyToScore, type BreedForMatch } from './scoring.js'

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
    }
  })

  res.json({ results, input })
})
