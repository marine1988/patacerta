import { Router } from 'express'
import { prisma } from '../../lib/prisma.js'

export const sitemapRouter = Router()

/**
 * `sitemap.xml` dinâmico. Devolve URLs estáticas (Home, pesquisar, simulador,
 * FAQ, legais) + todos os criadores VERIFIED + todos os serviços PUBLISHED.
 *
 * Convenções:
 * - O domínio público é lido de `PUBLIC_URL` (server-side); fallback para
 *   `https://patacerta.pt`. Crítico para que o sitemap seja válido em
 *   stage e produção sem hard-coding.
 * - URLs com query string (ex: `/pesquisar?tipo=servicos`) são incluídas
 *   porque representam páginas de listagem distintas com SEO próprio.
 * - `lastmod` para entidades vem do `updatedAt` da BD (Prisma) — para
 *   estáticas usamos a data do último deploy via `BUILD_TIME` (ou now).
 * - Cache: `public, max-age=3600` — ChatGPT-User/Googlebot revisitam algumas
 *   horas/dias, não precisamos de gerar a cada pedido.
 *
 * Montado **fora** do prefixo `/api`: o nginx tem que mapear `/sitemap.xml`
 * directamente para esta rota (ver `apps/web/nginx.conf`).
 */

const SITE_URL = (process.env.PUBLIC_URL || 'https://patacerta.pt').replace(/\/$/, '')

interface SitemapEntry {
  loc: string
  lastmod?: string
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority?: number
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${escapeXml(e.loc)}</loc>`]
      if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`)
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`)
      if (e.priority != null) parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

sitemapRouter.get('/sitemap.xml', async (_req, res) => {
  try {
    const now = new Date().toISOString()

    const staticEntries: SitemapEntry[] = [
      { loc: `${SITE_URL}/`, changefreq: 'daily', priority: 1.0, lastmod: now },
      { loc: `${SITE_URL}/pesquisar`, changefreq: 'daily', priority: 0.9, lastmod: now },
      {
        loc: `${SITE_URL}/pesquisar?tipo=servicos`,
        changefreq: 'daily',
        priority: 0.9,
        lastmod: now,
      },
      { loc: `${SITE_URL}/simulador-raca`, changefreq: 'monthly', priority: 0.7, lastmod: now },
      {
        loc: `${SITE_URL}/perguntas-frequentes`,
        changefreq: 'monthly',
        priority: 0.7,
        lastmod: now,
      },
      { loc: `${SITE_URL}/termos`, changefreq: 'yearly', priority: 0.3, lastmod: now },
      {
        loc: `${SITE_URL}/politica-privacidade`,
        changefreq: 'yearly',
        priority: 0.3,
        lastmod: now,
      },
    ]

    const [breeders, services] = await Promise.all([
      prisma.breeder.findMany({
        where: { status: 'VERIFIED' },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10000,
      }),
      prisma.service.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10000,
      }),
    ])

    const breederEntries: SitemapEntry[] = breeders.map((b) => ({
      loc: `${SITE_URL}/criador/${b.id}`,
      lastmod: b.updatedAt.toISOString(),
      changefreq: 'weekly',
      priority: 0.8,
    }))

    const serviceEntries: SitemapEntry[] = services.map((s) => ({
      loc: `${SITE_URL}/servicos/${s.id}`,
      lastmod: s.updatedAt.toISOString(),
      changefreq: 'weekly',
      priority: 0.7,
    }))

    const xml = renderSitemap([...staticEntries, ...breederEntries, ...serviceEntries])

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(xml)
  } catch (err) {
    console.error('[sitemap] erro a gerar sitemap:', err)
    res.status(500).type('text/plain').send('Erro a gerar sitemap')
  }
})
