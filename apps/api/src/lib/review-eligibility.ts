// ============================================
// PataCerta — Review eligibility
// ============================================
//
// Anti-fraude: para escrever uma avaliação, o autor precisa de ter trocado
// uma conversa real com o criador/serviço — pelo menos 2 mensagens enviadas
// por si E 2 mensagens recebidas da contraparte, dentro dos últimos 30 dias.
// Mensagens soft-deleted não contam.
//
// Admins ignoram esta regra (útil para seed/QA/intervenção).

import { prisma } from './prisma.js'

export const REVIEW_INTERACTION_WINDOW_DAYS = 30
export const REVIEW_INTERACTION_MIN_PER_SIDE = 2

export interface EligibilityResult {
  eligible: boolean
  /** Razão legível em pt-PT quando não elegível (para UI). */
  reason: string | null
  /** Detalhe estruturado para debugging / decisão fina no frontend. */
  detail: {
    threadFound: boolean
    sentByAuthor: number
    sentByCounterparty: number
    windowDays: number
    minPerSide: number
  }
}

const NOT_ENOUGH_INTERACTION_MSG =
  'Para avaliar, é necessário ter trocado pelo menos 2 mensagens enviadas e 2 recebidas com este destinatário nos últimos 30 dias.'

interface BreederTarget {
  kind: 'breeder'
  breederId: number
  /** userId do criador — counterparty do thread. */
  counterpartyUserId: number
}

interface ServiceTarget {
  kind: 'service'
  serviceId: number
  /** providerId do serviço — counterparty do thread. */
  counterpartyUserId: number
}

export type EligibilityTarget = BreederTarget | ServiceTarget

/**
 * Avalia se `authorId` tem interação suficiente para escrever uma review
 * sobre o `target`. Procura a thread única entre o autor e a contraparte
 * (criador ou serviço), conta mensagens não-deleted enviadas em cada
 * direção dentro da janela de 30 dias.
 */
export async function checkReviewEligibility(
  authorId: number,
  target: EligibilityTarget,
): Promise<EligibilityResult> {
  const since = new Date(Date.now() - REVIEW_INTERACTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  // Localizar a thread relevante. O modelo Thread tem unique (ownerId, breederId)
  // e (ownerId, serviceId) — i.e. o "owner" do thread é sempre o utilizador
  // não-prestador. Para os nossos efeitos:
  //   - se autor é o "owner": existe no máximo uma thread directa
  //   - se autor é a contraparte: o thread é iniciado pelo outro lado, mas
  //     a regra é simétrica (também queremos contar mensagens em ambas as
  //     direcções). Procuramos pela existência de qualquer thread entre os
  //     dois utilizadores sobre o alvo.
  const thread = await prisma.thread.findFirst({
    where:
      target.kind === 'breeder'
        ? {
            breederId: target.breederId,
            OR: [
              { ownerId: authorId },
              // Caso raro: autor é o próprio criador a avaliar um owner.
              // Não permitimos auto-review (validado fora), mas a query
              // mantém-se segura.
            ],
          }
        : {
            serviceId: target.serviceId,
            OR: [{ ownerId: authorId }],
          },
    select: { id: true },
  })

  if (!thread) {
    return {
      eligible: false,
      reason: NOT_ENOUGH_INTERACTION_MSG,
      detail: {
        threadFound: false,
        sentByAuthor: 0,
        sentByCounterparty: 0,
        windowDays: REVIEW_INTERACTION_WINDOW_DAYS,
        minPerSide: REVIEW_INTERACTION_MIN_PER_SIDE,
      },
    }
  }

  const [sentByAuthor, sentByCounterparty] = await Promise.all([
    prisma.message.count({
      where: {
        threadId: thread.id,
        senderId: authorId,
        deletedAt: null,
        createdAt: { gte: since },
      },
    }),
    prisma.message.count({
      where: {
        threadId: thread.id,
        senderId: target.counterpartyUserId,
        deletedAt: null,
        createdAt: { gte: since },
      },
    }),
  ])

  const eligible =
    sentByAuthor >= REVIEW_INTERACTION_MIN_PER_SIDE &&
    sentByCounterparty >= REVIEW_INTERACTION_MIN_PER_SIDE

  return {
    eligible,
    reason: eligible ? null : NOT_ENOUGH_INTERACTION_MSG,
    detail: {
      threadFound: true,
      sentByAuthor,
      sentByCounterparty,
      windowDays: REVIEW_INTERACTION_WINDOW_DAYS,
      minPerSide: REVIEW_INTERACTION_MIN_PER_SIDE,
    },
  }
}
