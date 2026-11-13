/**
 * Backfill de `Breed.imageUrl` a partir do catálogo editorial (`BREEDS`).
 *
 * O seed (`prisma/seed.ts`) só corre quando `RUN_SEED_ON_BOOT=true`, o que
 * **não** é o caso em stage/produção (default `false`). Sem este job, alterar
 * `BREED_IMAGES` em `prisma/breeds-data.ts` não chega à base de dados: a API
 * (`GET /api/breeds`) continua a devolver o `imageUrl` antigo — nomeadamente
 * os hotlinks do dog.ceo/Unsplash, dois deles já 404.
 *
 * Idempotente: só escreve nas raças cujo `imageUrl` difere do catálogo.
 * Best-effort: o entrypoint não aborta o boot se falhar (uma imagem em falta
 * degrada para o `ImageFallback` no frontend, não parte a API).
 *
 * Corre com `tsx` porque `prisma/` está fora do `tsconfig` da API (o build tsc
 * não o compila). Ver `entrypoint.sh`.
 *
 * Uso manual: `npx tsx apps/api/src/jobs/backfill-breed-images.ts`
 */
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { BREED_IMAGES } from '../lib/breed-images.js'

async function main(): Promise<void> {
  const start = Date.now()
  let scanned = 0
  let updated = 0
  const ausentes: string[] = []

  for (const [slug, desejado] of Object.entries(BREED_IMAGES)) {
    const row = await prisma.breed.findUnique({
      where: { nameSlug: slug },
      select: { id: true, imageUrl: true },
    })
    if (!row) {
      ausentes.push(slug)
      continue
    }
    scanned++
    const atual = row.imageUrl ?? null
    const alvo = desejado ?? null
    if (atual !== alvo) {
      await prisma.breed.update({
        where: { id: row.id },
        data: { imageUrl: alvo },
      })
      updated++
    }
  }

  // Raças presentes na DB mas ausentes do catálogo (ex.: slugs renomeados como
  // `galgo-portugues` -> `podengo-portugues`) são removidas para não manter
  // hotlinks órfãos. Só apaga se não houver referências (breeders/slots); caso
  // contrário regista aviso e deixa a linha (evita perda de dados de utilizadores).
  const catalogSlugs = new Set(Object.keys(BREED_IMAGES))
  const stale = await prisma.breed.findMany({
    where: { nameSlug: { notIn: [...catalogSlugs] } },
    select: { id: true, nameSlug: true, imageUrl: true, breeders: { select: { breedId: true } }, sponsoredSlots: { select: { id: true } } },
  })
  let removed = 0
  const staleReferenciadas: string[] = []
  for (const row of stale) {
    if (row.breeders.length > 0 || row.sponsoredSlots.length > 0) {
      staleReferenciadas.push(row.nameSlug)
      continue
    }
    await prisma.breed.delete({ where: { id: row.id } })
    removed++
  }
  if (staleReferenciadas.length > 0) {
    logger.warn({ staleReferenciadas }, '[backfill-breed-images] raças obsoletas com referências — não removidas')
  }

  logger.info(
    {
      scanned,
      updated,
      ausentesNaDb: ausentes.length,
      obsoletasRemovidas: removed,
      durationMs: Date.now() - start,
    },
    '[backfill-breed-images] concluido',
  )
  if (ausentes.length > 0) {
    logger.warn({ ausentes }, '[backfill-breed-images] raças do catálogo ausentes na DB')
  }
}

main()
  .catch((err) => {
    logger.error({ err }, '[backfill-breed-images] falhou')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
