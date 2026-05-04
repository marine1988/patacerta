/**
 * Backfill `Breeder.slug` e `Service.slug` para registos legados que
 * foram criados antes do campo existir, ou inseridos por seeds antigas
 * que não geravam slug. Idempotente: salta os que já têm slug.
 *
 * Corre **antes** do `prisma db push` (ver entrypoint.sh) porque o
 * schema declara agora `slug String` NOT NULL — se a DB tiver NULLs
 * de boots anteriores, o db push falharia a aplicar a constraint sem
 * este job correr primeiro. Schema-agnostic via SQL raw.
 *
 * Pós-Fase B este job é essencialmente uma no-op de safety, executando
 * em zero updates na maioria dos boots.
 *
 * Uso (manual): node dist/jobs/backfill-slugs.js
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
