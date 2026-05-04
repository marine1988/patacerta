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
 * preencher slugs em todos os Breeders existentes. Idempotente — saltam
 * os que já têm slug.
 *
 * Não usa transacção: cada update é independente, e em caso de falha
 * parcial o próximo boot termina o trabalho.
 */
export async function backfillAllBreederSlugs(): Promise<{ scanned: number; updated: number }> {
  const targets = await prisma.breeder.findMany({
    where: { slug: null },
    select: { id: true, businessName: true },
  })
  let updated = 0
  for (const t of targets) {
    try {
      const slug = await generateBreederSlug(t.businessName)
      await prisma.breeder.update({ where: { id: t.id }, data: { slug } })
      updated += 1
    } catch (err) {
      console.error(`[breeder-slug] backfill falhou para id=${t.id}:`, err)
    }
  }
  return { scanned: targets.length, updated }
}
