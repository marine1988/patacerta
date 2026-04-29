import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

/**
 * Recalcula `avgRating` e `reviewCount` no Breeder a partir das Reviews
 * com status PUBLISHED. Chamado apos qualquer mutacao em Review (create,
 * update do rating, delete, ou mudanca de status — moderacao,
 * auto-flag, dismiss flags).
 *
 * Nao falha o request principal se a recomputacao falhar; logamos e
 * seguimos. Em pior caso o agregado fica stale ate' a' proxima escrita;
 * uma cron de reconciliacao pode periodicamente refazer a contagem (ver
 * jobs/recompute-breeder-stats.ts — TODO).
 */
export async function recomputeBreederRating(breederId: number): Promise<void> {
  try {
    const agg = await prisma.review.aggregate({
      where: { breederId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { id: true },
    })
    const reviewCount = agg._count.id
    const avgRating = agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null

    await prisma.breeder.update({
      where: { id: breederId },
      data: { avgRating, reviewCount },
    })
  } catch (err) {
    logger.error({ err, breederId }, '[breeder-stats] recomputeBreederRating failed')
  }
}
