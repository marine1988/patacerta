import { Prisma } from '@prisma/client'
import { prisma as defaultPrisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

type Tx = Prisma.TransactionClient | typeof defaultPrisma

/**
 * Recalcula `avgRating` e `reviewCount` no Breeder a partir das Reviews
 * com status PUBLISHED. Chamado apos qualquer mutacao em Review (create,
 * update do rating, delete, ou mudanca de status — moderacao,
 * auto-flag, dismiss flags).
 *
 * Pode ser chamado dentro de uma transacao passando o tx client — nesse
 * caso erros propagam-se para fazer rollback da escrita principal. Sem
 * tx mantemos o try/catch defensivo (best-effort) para nao falhar o
 * request principal; o agregado fica stale ate' a' proxima escrita.
 */
export async function recomputeBreederRating(
  breederId: number,
  tx?: Tx,
): Promise<void> {
  if (tx) {
    const agg = await tx.review.aggregate({
      where: { breederId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { id: true },
    })
    const reviewCount = agg._count.id
    const avgRating = agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null
    await tx.breeder.update({
      where: { id: breederId },
      data: { avgRating, reviewCount },
    })
    return
  }

  try {
    const agg = await defaultPrisma.review.aggregate({
      where: { breederId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { id: true },
    })
    const reviewCount = agg._count.id
    const avgRating = agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null

    await defaultPrisma.breeder.update({
      where: { id: breederId },
      data: { avgRating, reviewCount },
    })
  } catch (err) {
    logger.error({ err, breederId }, '[breeder-stats] recomputeBreederRating failed')
  }
}
