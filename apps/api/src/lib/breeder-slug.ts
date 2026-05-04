import { prisma } from './prisma.js'
import { slugify, ensureUniqueSlug } from './slugify.js'

/**
 * Helpers de geração de slug para Breeder. Mantém a regra num só sítio:
 * - Slug deriva de `businessName` (que fica imutável após verificação).
 * - Único na tabela, com sufixo numérico em caso de colisão.
 * - Truncado a 100 caracteres (ver schema: VARCHAR(120) deixa folga).
 *
 * Idempotente: `backfillBreederSlug` só gera quando o slug é NULL.
 */
export async function generateBreederSlug(businessName: string): Promise<string> {
  const base = slugify(businessName, 100) || 'criador'
  return ensureUniqueSlug(base, async (candidate) => {
    const existing = await prisma.breeder.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    return !!existing
  })
}

/**
 * Backfill um único Breeder se ainda não tem slug. Devolve o slug final
 * (existente ou recém-gerado).
 */
export async function ensureBreederSlug(breederId: number): Promise<string> {
  const breeder = await prisma.breeder.findUnique({
    where: { id: breederId },
    select: { slug: true, businessName: true },
  })
  if (!breeder) throw new Error(`ensureBreederSlug: Breeder ${breederId} nao existe`)
  if (breeder.slug) return breeder.slug

  const newSlug = await generateBreederSlug(breeder.businessName)
  await prisma.breeder.update({ where: { id: breederId }, data: { slug: newSlug } })
  return newSlug
}

/**
 * Backfill em massa: corre uma vez no boot (ver entrypoint.sh) para
 * preencher slugs em todos os Breeders existentes que ainda tenham
 * slug NULL — registos legados de antes do campo ser introduzido, ou
 * inseridos por seeds que não geraram slug.
 *
 * Idempotente — saltam os que já têm slug. Não usa transacção: cada
 * update é independente, e em caso de falha parcial o próximo boot
 * termina o trabalho.
 *
 * Usa SQL raw em vez de `prisma.findMany({ where: { slug: null } })`
 * para ser **schema-agnostic**: com `slug` agora NOT NULL no schema,
 * o cliente Prisma rejeitaria esse filtro em compile-time, mas a DB
 * pode ainda ter NULLs nos primeiros boots após a migration. Este
 * backfill tem que correr **antes** do `prisma db push` que introduz
 * a constraint NOT NULL.
 */
export async function backfillAllBreederSlugs(): Promise<{ scanned: number; updated: number }> {
  const targets = await prisma.$queryRawUnsafe<Array<{ id: number; business_name: string }>>(
    `SELECT id, business_name FROM breeders WHERE slug IS NULL`,
  )
  let updated = 0
  for (const t of targets) {
    try {
      const slug = await generateBreederSlug(t.business_name)
      await prisma.$executeRawUnsafe(
        `UPDATE breeders SET slug = $1 WHERE id = $2 AND slug IS NULL`,
        slug,
        t.id,
      )
      updated += 1
    } catch (err) {
      console.error(`[breeder-slug] backfill falhou para id=${t.id}:`, err)
    }
  }
  return { scanned: targets.length, updated }
}
