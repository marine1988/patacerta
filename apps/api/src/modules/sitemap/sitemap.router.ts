import { Router } from 'express'
import { prisma } from '../../lib/prisma.js'

export const sitemapRouter = Router()

const SITE_URL = (process.env.PUBLIC_URL || 'https://patacerta.pt').replace(/\/$/, '')

/**
 * Redirect 301 server-side: /criador/:id -> /criador/:slug.
 * Montado dentro do nginx via location regex que proxia para
 * /__redirect/breeder/:id (ver apps/web/nginx.conf).
 *
 * Resposta:
 * - 301 com Location relativa (ex: `/criador/canil-do-norte`) — assim
 *   funciona em qualquer host (stage, prod, dev local) sem depender de
 *   PUBLIC_URL.
 * - 404 se não existe ou ainda não tem slug (deixa o SPA tratar)
 *
 * Cache: 5 min (redireccionamentos podem mudar se o businessName mudar
 * antes da verificação, embora seja raro).
 */
sitemapRouter.get('/__redirect/breeder/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) return res.status(404).end()
  const breeder = await prisma.breeder.findUnique({
    where: { id },
    select: { slug: true, status: true },
  })
  if (!breeder || !breeder.slug) return res.status(404).end()
  res.setHeader('Cache-Control', 'public, max-age=300')
  return res.redirect(301, `/criador/${breeder.slug}`)
})

sitemapRouter.get('/__redirect/service/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) return res.status(404).end()
  const service = await prisma.service.findUnique({
    where: { id },
    select: { slug: true },
  })
  if (!service || !service.slug) return res.status(404).end()
  res.setHeader('Cache-Control', 'public, max-age=300')
  return res.redirect(301, `/servicos/${service.slug}`)
})

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
        select: { id: true, slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10000,
      }),
      prisma.service.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10000,
      }),
    ])

    // Preferimos slug quando existe; fallback para id durante o
    // período de backfill. Quando o backfill estiver completo, todos
    // têm slug e o fallback nunca é exercido.
    const breederEntries: SitemapEntry[] = breeders.map((b) => ({
      loc: `${SITE_URL}/criador/${b.slug ?? b.id}`,
      lastmod: b.updatedAt.toISOString(),
      changefreq: 'weekly',
      priority: 0.8,
    }))

    const serviceEntries: SitemapEntry[] = services.map((s) => ({
      loc: `${SITE_URL}/servicos/${s.slug ?? s.id}`,
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
