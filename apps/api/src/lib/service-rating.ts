import { Prisma } from '@prisma/client'
import { prisma as defaultPrisma } from './prisma.js'

type Tx = Prisma.TransactionClient | typeof defaultPrisma

/**
 * Recalcula avg_rating e review_count de um Service com base nas
 * ServiceReview com status='PUBLISHED'. Pode ser chamado dentro de uma
 * transação passando o tx client.
 */
export async function recomputeServiceRating(
  serviceId: number,
  tx: Tx = defaultPrisma,
): Promise<void> {
  const agg = await tx.serviceReview.aggregate({
    where: { serviceId, status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: { id: true },
  })

  const avg = agg._avg.rating ? Math.round(agg._avg.rating * 100) / 100 : 0
  const count = agg._count.id

  await tx.service.update({
    where: { id: serviceId },
    data: {
      avgRating: new Prisma.Decimal(avg),
      reviewCount: count,
    },
  })
}
