import { prisma } from './prisma.js'
import { slugify, ensureUniqueSlug } from './slugify.js'

/**
 * Helpers de geração de slug para Service. Diferente de Breeder:
 * - `title` é mutável pelo provider, mas para preservar SEO e evitar
 *   broken links, **não regeramos slug em update** depois do primeiro
 *   create. O slug fica fixo (a primeira vez que se publica é a versão
 *   canónica para sempre).
 * - Se quisermos mudar slug deliberadamente no futuro, fica para feature
 *   "rename slug" com redirect explícito.
 *
 * Único na tabela. Truncado a 140 caracteres (VARCHAR(160) na BD).
 */
export async function generateServiceSlug(title: string): Promise<string> {
  const base = slugify(title, 140) || 'servico'
  return ensureUniqueSlug(base, async (candidate) => {
    const existing = await prisma.service.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    return !!existing
  })
}

/**
 * Backfill em massa para Services. Idempotente.
 *
 * Schema-agnostic via SQL raw — ver `backfillAllBreederSlugs` para
 * justificação detalhada.
 */
export async function backfillAllServiceSlugs(): Promise<{ scanned: number; updated: number }> {
  const targets = await prisma.$queryRawUnsafe<Array<{ id: number; title: string }>>(
    `SELECT id, title FROM services WHERE slug IS NULL`,
  )
  let updated = 0
  for (const t of targets) {
    try {
      const slug = await generateServiceSlug(t.title)
      await prisma.$executeRawUnsafe(
        `UPDATE services SET slug = $1 WHERE id = $2 AND slug IS NULL`,
        slug,
        t.id,
      )
      updated += 1
    } catch (err) {
      console.error(`[service-slug] backfill falhou para id=${t.id}:`, err)
    }
  }
  return { scanned: targets.length, updated }
}
