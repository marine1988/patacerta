// ============================================
// PataCerta — Zod Schemas (Breed Matcher)
// ============================================
//
// Quiz para o simulador "encontrar a raça ideal de cão". Todas as
// respostas são categóricas (enum). O backend transforma estas
// respostas num vector de pesos por atributo (ver
// apps/api/src/modules/breed-matcher/scoring.ts).

import { z } from 'zod'

// ─── Enums das respostas ────────────────────────────────────────────

export const housingEnum = z.enum([
  'apartment_small',
  'apartment_large',
  'house_no_garden',
  'house_garden',
  'rural',
])
export const activityEnum = z.enum(['low', 'medium', 'high', 'athlete']) // exercício diário do dono
export const timeAloneEnum = z.enum(['rarely', 'few_hours', 'half_day', 'full_day'])
export const experienceEnum = z.enum(['novice', 'some', 'experienced'])
export const householdEnum = z.enum(['single', 'couple', 'kids_small', 'kids_teen', 'elders'])
export const otherDogsEnum = z.enum(['none', 'one', 'multiple'])
export const allergiesEnum = z.enum(['none', 'mild', 'severe'])
export const groomingEnum = z.enum(['minimal', 'moderate', 'happy_to_groom'])
export const noiseEnum = z.enum(['quiet', 'medium', 'no_problem'])
export const climateEnum = z.enum(['hot', 'mild', 'cold'])
export const sizePreferenceEnum = z.enum(['any', 'small', 'medium', 'large'])

// ─── Input do match ─────────────────────────────────────────────────

export const breedMatchInputSchema = z.object({
  housing: housingEnum,
  activity: activityEnum,
  timeAlone: timeAloneEnum,
  experience: experienceEnum,
  household: householdEnum,
  otherDogs: otherDogsEnum,
  allergies: allergiesEnum,
  grooming: groomingEnum,
  noiseTolerance: noiseEnum,
  climate: climateEnum,
  sizePreference: sizePreferenceEnum,
})

export type BreedMatchInput = z.infer<typeof breedMatchInputSchema>

// ─── Output do match (apenas tipos — Zod não valida resposta) ───────

export interface SponsoredBreederMini {
  /** Slot id — usado para tracking de cliques. */
  slotId: number
  breederId: number
  businessName: string
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
  avgRating: number | null
  reviewCount: number
  /** URL da primeira foto (cover) se existir. */
  coverPhotoUrl: string | null
}

export interface BreedMatchResult {
  breed: {
    id: number
    nameSlug: string
    namePt: string
    fciGroup: string | null
    origin: string | null
    summaryPt: string
    size: string
    weightMinKg: number
    weightMaxKg: number
    lifespanMinYrs: number
    lifespanMaxYrs: number
    energyLevel: number
    exerciseDailyMin: number
    trainability: number
    groomingLevel: number
    apartmentFriendly: boolean
    noviceFriendly: boolean
    hypoallergenic: boolean
    imageUrl: string | null
  }
  /** Pontuação 0-100 (relativa ao melhor match possível). */
  score: number
  /** Razões positivas/negativas relevantes para mostrar ao utilizador. */
  highlights: string[]
  /** Criadores patrocinados desta raça (máx. 3, só VERIFIED, com label "Patrocinado" obrigatório na UI). */
  sponsoredBreeders: SponsoredBreederMini[]
}

export interface BreedMatchResponse {
  results: BreedMatchResult[]
  /** Eco do input para debug/SEO. */
  input: BreedMatchInput
}
