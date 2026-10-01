import { useEffect, useRef } from 'react'
import { SITE_NAME, DEFAULT_OG_IMAGE, absoluteUrl, canonicalUrlFromPath } from '../lib/seo'

/**
 * Hook completo de SEO/Open Graph/Twitter/canonical/JSON-LD que gere
 * `document.head` de forma segura com React. Cada página pública deve
 * chamá-lo **uma vez** com os dados reais.
 *
 * Estratégia: elementos são criados uma única vez (lazy init) e nunca
 * removidos do DOM — apenas os seus atributos são actualizados. Nos
 * cleanups, restauram-se os valores anteriores. Isto elimina o bug de
 * "Failed to execute removeChild on Node" que ocorria quando o React
 * desmontava/remontava componentes e o cleanup tentava remover elementos
 * que já não estavam no DOM ou que o React já tinha removido.
 */
export interface PageMetaOptions {
  title: string
  description?: string
  canonicalPath?: string
  imageUrl?: string
  type?: string
  noIndex?: boolean
  jsonLd?: object | object[]
}

function ensureMetaByName(name: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    el.setAttribute('data-managed', 'patacerta')
    document.head.appendChild(el)
  }
  return el
}

function ensureMetaByProperty(property: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    el.setAttribute('data-managed', 'patacerta')
    document.head.appendChild(el)
  }
  return el
}

function ensureCanonical(): HTMLLinkElement {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    el.setAttribute('data-managed', 'patacerta')
    document.head.appendChild(el)
  }
  return el
}

function ensureJsonLdScript(): HTMLScriptElement {
  let el = document.head.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"][data-managed="patacerta-page"]',
  )
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute('data-managed', 'patacerta-page')
    document.head.appendChild(el)
  }
  return el
}

function withSiteSuffix(title: string): string {
  if (title.includes(SITE_NAME)) return title
  return `${title} — ${SITE_NAME}`
}

export function usePageMeta(options: PageMetaOptions): void {
  const { title, description, canonicalPath, imageUrl, type = 'website', noIndex, jsonLd } = options

  // Guardar referências estáveis para os elementos geridos
  const elementsRef = useRef<{
    description?: HTMLMetaElement
    robots?: HTMLMetaElement
    ogTitle?: HTMLMetaElement
    ogDescription?: HTMLMetaElement
    ogImage?: HTMLMetaElement
    ogUrl?: HTMLMetaElement
    ogType?: HTMLMetaElement
    twitterTitle?: HTMLMetaElement
    twitterDescription?: HTMLMetaElement
    twitterImage?: HTMLMetaElement
    canonical?: HTMLLinkElement
    jsonLd?: HTMLScriptElement
  } | null>(null)

  useEffect(() => {
    const finalTitle = withSiteSuffix(title)
    const finalImage = imageUrl ? absoluteUrl(imageUrl) : DEFAULT_OG_IMAGE
    const finalCanonical = canonicalUrlFromPath(canonicalPath ?? window.location.pathname)

    const previousTitle = document.title

    // Lazy init: criar elementos uma única vez
    if (!elementsRef.current) {
      elementsRef.current = {
        description: ensureMetaByName('description'),
        robots: ensureMetaByName('robots'),
        ogTitle: ensureMetaByProperty('og:title'),
        ogDescription: ensureMetaByProperty('og:description'),
        ogImage: ensureMetaByProperty('og:image'),
        ogUrl: ensureMetaByProperty('og:url'),
        ogType: ensureMetaByProperty('og:type'),
        twitterTitle: ensureMetaByName('twitter:title'),
        twitterDescription: ensureMetaByName('twitter:description'),
        twitterImage: ensureMetaByName('twitter:image'),
        canonical: ensureCanonical(),
        jsonLd: ensureJsonLdScript(),
      }
    }

    const el = elementsRef.current

    // Guardar valores anteriores para restaurar no cleanup
    const prev = {
      title: previousTitle,
      description: el.description!.getAttribute('content'),
      robots: el.robots!.getAttribute('content'),
      ogTitle: el.ogTitle!.getAttribute('content'),
      ogDescription: el.ogDescription!.getAttribute('content'),
      ogImage: el.ogImage!.getAttribute('content'),
      ogUrl: el.ogUrl!.getAttribute('content'),
      ogType: el.ogType!.getAttribute('content'),
      twitterTitle: el.twitterTitle!.getAttribute('content'),
      twitterDescription: el.twitterDescription!.getAttribute('content'),
      twitterImage: el.twitterImage!.getAttribute('content'),
      canonical: el.canonical!.getAttribute('href'),
      jsonLd: el.jsonLd!.textContent,
    }

    // Actualizar valores
    document.title = finalTitle

    if (description !== undefined) {
      el.description!.setAttribute('content', description)
    }
    if (noIndex) {
      el.robots!.setAttribute('content', 'noindex,nofollow')
    }

    // Open Graph
    el.ogTitle!.setAttribute('content', finalTitle)
    if (description !== undefined) {
      el.ogDescription!.setAttribute('content', description)
    }
    el.ogImage!.setAttribute('content', finalImage)
    el.ogUrl!.setAttribute('content', finalCanonical)
    el.ogType!.setAttribute('content', type)

    // Twitter
    el.twitterTitle!.setAttribute('content', finalTitle)
    if (description !== undefined) {
      el.twitterDescription!.setAttribute('content', description)
    }
    el.twitterImage!.setAttribute('content', finalImage)

    // Canonical
    el.canonical!.setAttribute('href', finalCanonical)

    // JSON-LD
    if (jsonLd) {
      const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
      el.jsonLd!.textContent = JSON.stringify(items.length === 1 ? items[0] : items)
    }

    // Cleanup: restaurar valores anteriores (sem remover elementos do DOM)
    return () => {
      document.title = prev.title
      if (prev.description === null) {
        el.description!.removeAttribute('content')
      } else {
        el.description!.setAttribute('content', prev.description)
      }
      if (prev.robots === null) {
        el.robots!.removeAttribute('content')
      } else {
        el.robots!.setAttribute('content', prev.robots)
      }
      el.ogTitle!.setAttribute('content', prev.ogTitle ?? '')
      if (prev.ogDescription === null) {
        el.ogDescription!.removeAttribute('content')
      } else {
        el.ogDescription!.setAttribute('content', prev.ogDescription)
      }
      el.ogImage!.setAttribute('content', prev.ogImage ?? '')
      el.ogUrl!.setAttribute('content', prev.ogUrl ?? '')
      el.ogType!.setAttribute('content', prev.ogType ?? '')
      el.twitterTitle!.setAttribute('content', prev.twitterTitle ?? '')
      if (prev.twitterDescription === null) {
        el.twitterDescription!.removeAttribute('content')
      } else {
        el.twitterDescription!.setAttribute('content', prev.twitterDescription)
      }
      el.twitterImage!.setAttribute('content', prev.twitterImage ?? '')
      el.canonical!.setAttribute('href', prev.canonical ?? '')
      el.jsonLd!.textContent = prev.jsonLd ?? ''
    }
  }, [title, description, canonicalPath, imageUrl, type, noIndex, jsonLd])
}
