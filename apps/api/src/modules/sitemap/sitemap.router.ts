import { Router } from 'express'
import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'
import { getPublicBaseUrl } from '../../lib/env.js'
import { cacheGetOrSet } from '../../lib/cache.js'

export const sitemapRouter = Router()

/*
 * A origem canónica de todos os `<loc>` é resolvida por pedido com
 * `getPublicBaseUrl()` (`PUBLIC_URL` → `FRONTEND_URL`, sem default de
 * produção — ver `apps/api/src/lib/env.ts`).
 *
 * Uma sitemap nunca pode anunciar outro host que não o que a serve: era
 * isso que acontecia em stage, onde faltava `PUBLIC_URL` e o código caía
 * num default `https://patacerta.pt` (PATA-BUG-7).
 */

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
sitemapRouter.get(
  '/__redirect/breeder/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(404).end()
      return
    }
    const breeder = await prisma.breeder.findUnique({
      where: { id },
      select: { slug: true, status: true },
    })
    if (!breeder || !breeder.slug) {
      res.status(404).end()
      return
    }
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.redirect(301, `/criador/${breeder.slug}`)
  }),
)

sitemapRouter.get(
  '/__redirect/service/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(404).end()
      return
    }
    const service = await prisma.service.findUnique({
      where: { id },
      select: { slug: true },
    })
    if (!service || !service.slug) {
      res.status(404).end()
      return
    }
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.redirect(301, `/servicos/${service.slug}`)
  }),
)

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

/*
 * SEC-04: a sitemap é read-only e muda pouco (criadores VERIFIED e serviços
 * ACTIVE), mas cada pedido fazia 2 `findMany` com `take: 10000` e a rota está
 * isenta de rate limit — um crawler a pedir `/sitemap.xml` em ciclo forçava
 * dois full scans à DB por pedido. O XML passa a ser servido por
 * `cacheGetOrSet` (Redis quando disponível, Map in-process caso contrário).
 *
 * - A chave inclui a origem canónica (`getPublicBaseUrl()`): o mesmo processo
 *   pode servir hosts diferentes e o XML de um host nunca pode ser servido a
 *   outro (a sitemap anuncia sempre o host que a serve — PATA-BUG-7).
 * - O TTL é a invalidação: conteúdo novo (criador verificado, serviço activo)
 *   aparece em ≤5 min. O Redis sobrevive a restarts, por isso não há
 *   invalidação no boot a contar com isso.
 * - Os `<lastmod>` das entradas estáticas são o instante em que o XML foi
 *   gerado: dentro de uma janela de cache ficam até 5 min "atrasados", o que
 *   é irrelevante para o crawl.
 * - `Cache-Control: public, max-age=3600` mantém-se inalterado — é para o
 *   browser/proxy à frente, não substitui este cache (que é o que poupa a DB).
 * - Se o `loader` falhar, `cacheGetOrSet` propaga o erro e nada fica em cache
 *   (sem cache negativo): o próximo pedido volta a tentar.
 */
const SITEMAP_CACHE_TTL_MS = 5 * 60 * 1000

function sitemapCacheKey(siteUrl: string): string {
  return `sitemap:xml:v1:${siteUrl}`
}

async function buildSitemapXml(siteUrl: string): Promise<string> {
  const now = new Date().toISOString()

  const staticEntries: SitemapEntry[] = [
    { loc: `${siteUrl}/`, changefreq: 'daily', priority: 1.0, lastmod: now },
    { loc: `${siteUrl}/pesquisar`, changefreq: 'daily', priority: 0.9, lastmod: now },
    {
      loc: `${siteUrl}/pesquisar?tipo=servicos`,
      changefreq: 'daily',
      priority: 0.9,
      lastmod: now,
    },
    { loc: `${siteUrl}/simulador-raca`, changefreq: 'monthly', priority: 0.7, lastmod: now },
    {
      loc: `${siteUrl}/perguntas-frequentes`,
      changefreq: 'monthly',
      priority: 0.7,
      lastmod: now,
    },
    { loc: `${siteUrl}/termos`, changefreq: 'yearly', priority: 0.3, lastmod: now },
    {
      loc: `${siteUrl}/politica-privacidade`,
      changefreq: 'yearly',
      priority: 0.3,
      lastmod: now,
    },
  ]

  const [breeders, services] = await Promise.all([
    prisma.breeder.findMany({
      // Apenas criadores VERIFIED cujo utilizador esta activo e nao
      // suspenso. Sem este filtro, o sitemap incluia perfis que
      // depois devolvem 404 em /criador/:slug — Google penaliza
      // sitemaps com soft-404s (descredibiliza o sitemap inteiro)
      // e, do lado UX, o utilizador clica num resultado SERP que
      // nao existe. Coerente com getBreederById que ja exclui estes.
      where: {
        status: 'VERIFIED',
        user: { isActive: true, suspendedAt: null },
      },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 10000,
    }),
    prisma.service.findMany({
      // Idem para servicos: ACTIVE + provider activo nao-suspenso.
      // Coerente com publicServicePublicSelect's where filter em
      // services.controller.ts.
      where: {
        status: 'ACTIVE',
        provider: { isActive: true, suspendedAt: null },
      },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 10000,
    }),
  ])

  // Preferimos slug quando existe; fallback para id durante o
  // período de backfill. Quando o backfill estiver completo, todos
  // têm slug e o fallback nunca é exercido.
  const breederEntries: SitemapEntry[] = breeders.map((b) => ({
    loc: `${siteUrl}/criador/${b.slug ?? b.id}`,
    lastmod: b.updatedAt.toISOString(),
    changefreq: 'weekly',
    priority: 0.8,
  }))

  const serviceEntries: SitemapEntry[] = services.map((s) => ({
    loc: `${siteUrl}/servicos/${s.slug ?? s.id}`,
    lastmod: s.updatedAt.toISOString(),
    changefreq: 'weekly',
    priority: 0.7,
  }))

  return renderSitemap([...staticEntries, ...breederEntries, ...serviceEntries])
}

sitemapRouter.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    try {
      const siteUrl = getPublicBaseUrl()

      const xml = await cacheGetOrSet(sitemapCacheKey(siteUrl), SITEMAP_CACHE_TTL_MS, () =>
        buildSitemapXml(siteUrl),
      )

      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.send(xml)
    } catch (err) {
      console.error('[sitemap] erro a gerar sitemap:', err)
      res.status(500).type('text/plain').send('Erro a gerar sitemap')
    }
  }),
)
