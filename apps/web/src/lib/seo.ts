/**
 * SEO config — URLs canónicas, defaults para meta tags e helpers
 * para construir URLs absolutas.
 *
 * `VITE_PUBLIC_URL` é a fonte de verdade para o domínio canónico.
 * Em SSR/build não temos `window.location`, por isso este valor é
 * obrigatório para gerar `og:url`/`canonical` consistentes em todas
 * as páginas. Em dev local é `http://localhost:5173`.
 */
import { formatPrice, type ServicePriceUnit } from './format'
export const SITE_URL = (import.meta.env.VITE_PUBLIC_URL || 'https://patacerta.pt').replace(
  /\/$/,
  '',
)

export const SITE_NAME = 'PataCerta'

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.svg`

/**
 * Constrói uma URL absoluta a partir de um path. Se receber uma URL
 * absoluta, devolve-a inalterada (útil quando os dados da API já
 * trazem URLs completas, ex: imagens em MinIO).
 */
export function absoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return SITE_URL
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

/**
 * Constrói a URL canónica a partir do path actual da SPA. Remove
 * sempre query strings e fragmentos: a versão canónica de
 * `/pesquisar?q=labrador` é `/pesquisar` (caso contrário cada combinação
 * de filtros fica indexada como página distinta).
 *
 * Excepções (queries que MUDAM conteúdo significativo) devem chamar
 * `absoluteUrl(path + '?param=valor')` directamente.
 */
export function canonicalUrlFromPath(path: string): string {
  const cleanPath = path.split('?')[0]?.split('#')[0] ?? '/'
  return absoluteUrl(cleanPath)
}

/**
 * Compõe meta description curta para perfil de criador. Mantém-se abaixo
 * dos 200 caracteres (limite recomendado para SERPs e prévias sociais).
 *
 * Estrutura: "{nome} — criador {verificado} em {município}, {distrito}.
 * {avaliação opcional}. {primeira frase da descrição opcional}"
 */
export interface BreederMetaInput {
  businessName: string
  description?: string | null
  verifiedAt?: string | null
  municipality: { namePt: string }
  district: { namePt: string }
  avgRating?: number | null
  reviewCount?: number | null
}

export function buildBreederMetaDescription(breeder: BreederMetaInput): string {
  const verified = breeder.verifiedAt ? 'verificado ' : ''
  const location = `${breeder.municipality.namePt}, ${breeder.district.namePt}`
  const head = `${breeder.businessName} — criador ${verified}em ${location}.`

  const ratingPart =
    breeder.avgRating != null && breeder.reviewCount && breeder.reviewCount > 0
      ? ` ${Number(breeder.avgRating).toFixed(1)}/5 com base em ${breeder.reviewCount} avaliações.`
      : ''

  const descPart = breeder.description
    ? ` ${breeder.description.replace(/\s+/g, ' ').trim().slice(0, 120)}`
    : ''

  return `${head}${ratingPart}${descPart}`.slice(0, 200)
}

/**
 * Compõe meta description curta para anúncio de serviço. Mantém-se
 * abaixo dos 200 caracteres. Estrutura:
 *   "{categoria} em {municipio}, {distrito} — {preco}. {descricao curta}"
 *
 * Vive em `seo.ts` (e não na página) para que possa ser reutilizado em
 * futuros sítios — ex.: cards de partilha, e-mails, prerender.
 */
export interface ServiceMetaInput {
  category: { namePt: string }
  description: string
  priceCents: number
  priceUnit: ServicePriceUnit
  municipality: { namePt: string }
  district: { namePt: string }
}

export function buildServiceMetaDescription(service: ServiceMetaInput): string {
  const price = formatPrice(service.priceCents, service.priceUnit)
  const location = `${service.municipality.namePt}, ${service.district.namePt}`
  const summary = service.description.replace(/\s+/g, ' ').trim().slice(0, 140)
  return `${service.category.namePt} em ${location} — ${price}. ${summary}`.slice(0, 200)
}
