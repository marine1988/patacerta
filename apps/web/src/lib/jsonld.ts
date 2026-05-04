/**
 * Helpers para construir blocos JSON-LD compatíveis com schema.org.
 * Cada função devolve um objecto literal pronto a passar ao `usePageMeta`
 * via `jsonLd`. Mantém-se em puro TS (sem dependências) para que possa
 * correr também em scripts de build (sitemap, prerender) no futuro.
 */
import { absoluteUrl, SITE_NAME, SITE_URL } from './seo'

interface BreadcrumbItem {
  name: string
  /** Path absoluto (ex: `/criador/42`) ou URL completa. */
  path: string
}

export function breadcrumbListJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export interface LocalBusinessJsonLdInput {
  /** Path canónico do criador (ex: `/criador/42`). */
  path: string
  name: string
  description?: string | null
  image?: string | null
  /** Telefone E.164 ou nacional. */
  telephone?: string | null
  /** Município (locality). */
  addressLocality?: string | null
  /** Distrito (region administrativa). */
  addressRegion?: string | null
  latitude?: number | null
  longitude?: number | null
  avgRating?: number | null
  reviewCount?: number | null
  /** URL externo do criador (website próprio). */
  sameAs?: string[] | null
}

/**
 * `LocalBusiness` é o tipo mais consumido por Google AI Overviews para
 * negócios físicos com morada. Usamos o subtipo `PetStore` quando faz
 * sentido (criadores físicos), mas o subtipo é quase intermutável; o
 * tipo base `LocalBusiness` é amplamente compreendido.
 */
export function localBusinessJsonLd(input: LocalBusinessJsonLdInput) {
  const url = absoluteUrl(input.path)
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'PetStore'],
    '@id': url,
    name: input.name,
    url,
  }
  if (input.description) node.description = input.description
  if (input.image) node.image = absoluteUrl(input.image)
  if (input.telephone) node.telephone = input.telephone
  if (input.addressLocality || input.addressRegion) {
    node.address = {
      '@type': 'PostalAddress',
      addressCountry: 'PT',
      ...(input.addressLocality ? { addressLocality: input.addressLocality } : {}),
      ...(input.addressRegion ? { addressRegion: input.addressRegion } : {}),
    }
  }
  if (input.latitude != null && input.longitude != null) {
    node.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.latitude,
      longitude: input.longitude,
    }
  }
  if (input.avgRating != null && input.reviewCount && input.reviewCount > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(input.avgRating).toFixed(1),
      reviewCount: input.reviewCount,
      bestRating: 5,
      worstRating: 1,
    }
  }
  if (input.sameAs && input.sameAs.length > 0) {
    node.sameAs = input.sameAs
  }
  return node
}

export interface ServiceJsonLdInput {
  /** Path canónico (ex: `/servicos/27`). */
  path: string
  name: string
  description: string
  image?: string | null
  /** Em cêntimos. */
  priceCents?: number | null
  currency?: string
  /** Texto livre — ex: 'PT' ou 'Distrito do Porto'. */
  areaServed?: string | null
  providerName?: string | null
  providerPath?: string | null
  avgRating?: number | null
  reviewCount?: number | null
}

export function serviceJsonLd(input: ServiceJsonLdInput) {
  const url = absoluteUrl(input.path)
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': url,
    name: input.name,
    description: input.description,
    url,
  }
  if (input.image) node.image = absoluteUrl(input.image)
  if (input.areaServed) node.areaServed = input.areaServed
  if (input.providerName) {
    node.provider = {
      '@type': 'Organization',
      name: input.providerName,
      ...(input.providerPath ? { url: absoluteUrl(input.providerPath) } : {}),
    }
  }
  if (input.priceCents != null && input.priceCents >= 0) {
    node.offers = {
      '@type': 'Offer',
      price: (input.priceCents / 100).toFixed(2),
      priceCurrency: input.currency ?? 'EUR',
      availability: 'https://schema.org/InStock',
      url,
    }
  }
  if (input.avgRating != null && input.reviewCount && input.reviewCount > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(input.avgRating).toFixed(1),
      reviewCount: input.reviewCount,
      bestRating: 5,
      worstRating: 1,
    }
  }
  return node
}

export interface FaqItem {
  question: string
  answer: string
}

export function faqPageJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

/**
 * `WebSite` com `SearchAction` para a Home — habilita "sitelinks search box"
 * em Google. Já está estático no `index.html`, mas re-emitimos na Home com
 * URL canónico para reforço.
 */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'pt-PT',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/pesquisar?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.svg`,
    description: 'Directório de criadores verificados e serviços para cães em Portugal.',
    areaServed: { '@type': 'Country', name: 'Portugal' },
    knowsLanguage: 'pt-PT',
  }
}

export interface ItemListEntry {
  /** Path absoluto (ex: `/criador/canil-do-norte`). */
  path: string
  /** Nome humano legivel. */
  name: string
}

/**
 * `ItemList` para paginas de listagem (pesquisa). Ajuda Google e LLMs a
 * compreender a estrutura de paginas tipo "directorio" e habilita rich
 * results em SERP. Listamos so' os primeiros N items para nao explodir
 * o tamanho do JSON-LD (recomendacao Google: <= 100).
 *
 * Tipo aplicavel: 'ItemList' generico — funciona para qualquer mistura de
 * Breeders + Services. Se houver necessidade de tipar items individuais
 * (ex: cada um como LocalBusiness), passar para itemListElement como
 * objectos ricos em vez de URL strings.
 */
export function itemListJsonLd(items: ItemListEntry[], options?: { name?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    ...(options?.name ? { name: options.name } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  }
}

/**
 * `WebApplication` para tools tipo o simulador de raca. Ajuda LLMs a
 * descrever a ferramenta como aplicacao gratuita (em vez de pagina
 * estatica) e pode habilitar rich results.
 */
export function webApplicationJsonLd(input: {
  path: string
  name: string
  description: string
  applicationCategory?: string
}) {
  const url = absoluteUrl(input.path)
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': url,
    name: input.name,
    description: input.description,
    url,
    applicationCategory: input.applicationCategory ?? 'LifestyleApplication',
    operatingSystem: 'Any',
    inLanguage: 'pt-PT',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
    isAccessibleForFree: true,
  }
}
