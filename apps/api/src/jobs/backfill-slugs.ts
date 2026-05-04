/**
 * Backfill `Breeder.slug` e `Service.slug` para registos existentes que
 * foram criados antes do campo existir. Idempotente: salta os que já têm
 * slug.
 *
 * Corre no boot via entrypoint.sh, depois do `prisma db push`. Em
 * produção, depois de todos os registos terem slug, podemos tornar a
 * coluna NOT NULL (Fase B — não nesta sessão).
 *
 * Uso (manual): pnpm --filter @patacerta/api exec node dist/jobs/backfill-slugs.js
 */
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { backfillAllBreederSlugs } from '../lib/breeder-slug.js'
import { backfillAllServiceSlugs } from '../lib/service-slug.js'

async function main(): Promise<void> {
  const start = Date.now()

  const breeders = await backfillAllBreederSlugs()
  logger.info({ ...breeders }, '[backfill-slugs] breeders')

  const services = await backfillAllServiceSlugs()
  logger.info({ ...services }, '[backfill-slugs] services')

  logger.info(
    {
      breedersScanned: breeders.scanned,
      breedersUpdated: breeders.updated,
      servicesScanned: services.scanned,
      servicesUpdated: services.updated,
      durationMs: Date.now() - start,
    },
    '[backfill-slugs] concluido',
  )
}

main()
  .catch((err) => {
    logger.error({ err }, '[backfill-slugs] falhou')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
