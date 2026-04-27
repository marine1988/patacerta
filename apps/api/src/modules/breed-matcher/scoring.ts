// ============================================
// PataCerta — Breed matcher scoring
// ============================================
//
// Algoritmo:
//   Para cada raça, soma de penalidades. Quanto menor a penalidade,
//   melhor o match. Convertemos no fim para uma percentagem 0-100
//   relativa à melhor possível (`bestPossible`).
//
// Os "highlights" são razões legíveis em pt-PT que justificam o match
// (ou desmatch). Mostramos as 2-3 mais relevantes na UI.
//
// Mantemos isto explícito e auditável — não há ML escondido.

import type { BreedMatchInput } from '@patacerta/shared'

// Subset dos campos do Breed que precisamos para scoring (evita
// acoplamento ao Prisma type aqui).
export interface BreedForMatch {
  id: number
  size: string
  energyLevel: number
  exerciseDailyMin: number
  trainability: number
  groomingLevel: number
  shedding: number
  hypoallergenic: boolean
  apartmentFriendly: boolean
  noviceFriendly: boolean
  toleratesAlone: number
  goodWithKids: number
  goodWithDogs: number
  goodWithStrangers: number
  barkLevel: string
  coldTolerance: number
  heatTolerance: number
}

// Cada penalidade é positiva: 0 = match perfeito, valores altos = pior.
// Os pesos são propositadamente "round numbers" para facilitar afinação
// editorial sem precisar de explicar matemática complexa.

interface ScoreOutcome {
  /** Penalidade total. 0 é o melhor possível. */
  penalty: number
  positives: string[]
  negatives: string[]
}

export function scoreBreed(breed: BreedForMatch, input: BreedMatchInput): ScoreOutcome {
  let penalty = 0
  const positives: string[] = []
  const negatives: string[] = []

  // ─── Habitação x tamanho / apartmentFriendly ──────────────────────
  if (input.housing === 'apartment_small') {
    if (breed.size === 'giant' || breed.size === 'large') {
      penalty += 30
      negatives.push('Pode não caber bem num apartamento pequeno.')
    } else if (breed.apartmentFriendly) {
      penalty -= 5
      positives.push('Adapta-se bem a apartamento.')
    }
  } else if (input.housing === 'apartment_large' || input.housing === 'house_no_garden') {
    if (breed.size === 'giant') {
      penalty += 15
      negatives.push('Raça gigante — pede espaço considerável.')
    }
  } else if (input.housing === 'rural') {
    if (breed.size === 'giant' || breed.size === 'large') {
      penalty -= 5
      positives.push('Aproveita bem espaço rural.')
    }
  }

  // ─── Tamanho preferido ────────────────────────────────────────────
  if (input.sizePreference !== 'any' && breed.size !== input.sizePreference) {
    // Permite tolerância: large vs giant, small vs medium contam meio.
    const adjacency =
      (input.sizePreference === 'large' && breed.size === 'giant') ||
      (input.sizePreference === 'medium' && (breed.size === 'small' || breed.size === 'large'))
    penalty += adjacency ? 10 : 25
    if (!adjacency) negatives.push('Tamanho diferente do preferido.')
  }

  // ─── Energia x actividade do dono ─────────────────────────────────
  const ownerEnergy =
    input.activity === 'low'
      ? 1
      : input.activity === 'medium'
        ? 3
        : input.activity === 'high'
          ? 4
          : 5
  const energyDiff = Math.abs(breed.energyLevel - ownerEnergy)
  penalty += energyDiff * 8
  if (breed.energyLevel - ownerEnergy >= 2) {
    negatives.push('Necessita mais exercício do que o seu ritmo.')
  } else if (breed.energyLevel === ownerEnergy && ownerEnergy >= 3) {
    positives.push('Nível de energia compatível com o seu ritmo.')
  }

  // ─── Tempo sozinho x toleratesAlone ───────────────────────────────
  const aloneNeeded =
    input.timeAlone === 'rarely'
      ? 1
      : input.timeAlone === 'few_hours'
        ? 3
        : input.timeAlone === 'half_day'
          ? 4
          : 5
  if (breed.toleratesAlone < aloneNeeded) {
    const gap = aloneNeeded - breed.toleratesAlone
    penalty += gap * 12
    if (gap >= 2) negatives.push('Sofre se passar muito tempo sozinho.')
  } else if (breed.toleratesAlone >= 4 && aloneNeeded >= 4) {
    positives.push('Lida bem com longos períodos sozinho.')
  }

  // ─── Experiência x noviceFriendly / trainability ──────────────────
  if (input.experience === 'novice') {
    if (!breed.noviceFriendly) {
      penalty += 25
      negatives.push('Raça pouco indicada para donos de primeira vez.')
    } else {
      positives.push('Indicada para donos de primeira vez.')
    }
    if (breed.trainability <= 2) penalty += 10
  }

  // ─── Crianças no agregado ─────────────────────────────────────────
  if (input.household === 'kids_small') {
    const kidScore = breed.goodWithKids
    if (kidScore <= 2) {
      penalty += 25
      negatives.push('Não é a melhor escolha com crianças pequenas.')
    } else if (kidScore === 5) {
      positives.push('Excelente com crianças.')
    }
  } else if (input.household === 'kids_teen') {
    if (breed.goodWithKids <= 2) penalty += 10
  } else if (input.household === 'elders') {
    // Idosos: preferimos energia baixa-média e tamanho não-gigante.
    if (breed.energyLevel >= 4) penalty += 10
    if (breed.size === 'giant') penalty += 15
  }

  // ─── Outros cães ──────────────────────────────────────────────────
  if (input.otherDogs !== 'none' && breed.goodWithDogs <= 2) {
    penalty += input.otherDogs === 'multiple' ? 25 : 12
    negatives.push('Pouco tolerante a outros cães.')
  }

  // ─── Alergias ─────────────────────────────────────────────────────
  if (input.allergies === 'severe') {
    if (!breed.hypoallergenic) {
      penalty += 60
      negatives.push('Não é hipoalergénica — pode causar reacções.')
    } else {
      positives.push('Pelagem hipoalergénica — boa para alérgicos.')
    }
  } else if (input.allergies === 'mild') {
    if (!breed.hypoallergenic && breed.shedding >= 4) {
      penalty += 20
      negatives.push('Liberta muito pêlo — pode incomodar alérgicos.')
    } else if (breed.hypoallergenic) {
      positives.push('Pelagem hipoalergénica.')
    }
  }

  // ─── Disposição para tratar pelagem ───────────────────────────────
  if (input.grooming === 'minimal' && breed.groomingLevel >= 4) {
    penalty += 18
    negatives.push('Pelagem exige muitos cuidados.')
  } else if (input.grooming === 'happy_to_groom' && breed.groomingLevel >= 4) {
    positives.push('Pelagem premia quem gosta de tratar do cão.')
  }

  // ─── Tolerância a latido ──────────────────────────────────────────
  if (input.noiseTolerance === 'quiet' && breed.barkLevel === 'high') {
    penalty += 18
    negatives.push('Tende a vocalizar bastante.')
  }

  // ─── Clima ────────────────────────────────────────────────────────
  if (input.climate === 'hot' && breed.heatTolerance <= 2) {
    penalty += 15
    negatives.push('Sofre com calor — não ideal para clima quente.')
  } else if (input.climate === 'cold' && breed.coldTolerance <= 2) {
    penalty += 15
    negatives.push('Pouca tolerância a frio.')
  } else if (input.climate === 'hot' && breed.heatTolerance >= 4) {
    positives.push('Resiste bem ao calor.')
  } else if (input.climate === 'cold' && breed.coldTolerance >= 4) {
    positives.push('Resiste bem ao frio.')
  }

  return { penalty, positives, negatives }
}

/**
 * Converte penalidade em score 0-100. `worstPenalty` é a maior penalidade
 * observada na lista actual (usamos para normalizar para que a melhor
 * raça do conjunto fique sempre próxima dos 100). É deliberadamente
 * relativo ao conjunto e não absoluto — o objectivo é dar ao utilizador
 * um ranking comparativo, não uma "nota absoluta".
 */
export function penaltyToScore(penalty: number, worstPenalty: number): number {
  if (worstPenalty <= 0) return 100
  const clamped = Math.max(0, penalty)
  const ratio = 1 - clamped / Math.max(worstPenalty, 50)
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100)
}
