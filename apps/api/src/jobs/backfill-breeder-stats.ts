/**
 * Backfill `Breeder.avgRating` / `Breeder.reviewCount` a partir das
 * Reviews PUBLISHED. Execucao idempotente — pode correr quantas vezes
 * forem necessarias.
 *
 * Quando: depois de adicionar a desnormalizacao avgRating/reviewCount
 * em producao/stage. No futuro tambem pode ser usado como cron de
 * reconciliacao caso a recomputacao sincrona falhe (ver recomputeBreederRating
 * em services/breeder-stats.ts).
 *
 * Uso: pnpm --filter @patacerta/api job:backfill-breeder-stats
 */
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

async function main(): Promise<void> {
  const start = Date.now()

  // Agrupa em SQL — uma so' query devolve todas as agregacoes.
  const aggs = await prisma.review.groupBy({
    by: ['breederId'],
    where: { status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: { id: true },
  })

  logger.info({ count: aggs.length }, '[backfill] reviews agregadas por breeder')

  // Reset previo: breeders sem reviews ficam com 0/null.
  await prisma.breeder.updateMany({
    where: { id: { notIn: aggs.map((a) => a.breederId) } },
    data: { avgRating: null, reviewCount: 0 },
  })

  // Update por breeder. Em batch de 50 com Promise.all.
  const BATCH = 50
  let updated = 0
  for (let i = 0; i < aggs.length; i += BATCH) {
    const slice = aggs.slice(i, i + BATCH)
    await Promise.all(
      slice.map((a) => {
        const avg = a._avg.rating != null ? Math.round(a._avg.rating * 10) / 10 : null
        return prisma.breeder.update({
          where: { id: a.breederId },
          data: { avgRating: avg, reviewCount: a._count.id },
        })
      }),
    )
    updated += slice.length
  }

  logger.info({ updated, durationMs: Date.now() - start }, '[backfill] breeder stats actualizados')
}

main()
  .catch((err) => {
    logger.error({ err }, '[backfill] falhou')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
