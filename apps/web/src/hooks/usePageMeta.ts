import { useEffect } from 'react'
import { SITE_NAME, DEFAULT_OG_IMAGE, absoluteUrl, canonicalUrlFromPath } from '../lib/seo'

/**
 * Hook completo de SEO/Open Graph/Twitter/canonical/JSON-LD que escreve
 * em `document.head` sem libs externas. Cada página pública deve chamá-lo
 * **uma vez** com os dados reais (não usar valores estáticos quando
 * os dados vierem de uma query — esperar pelo loaded state).
 *
 * Comportamento:
 * - `<title>`: substituído. Restaurado ao desmontar.
 * - `meta[name=description]`: substituído. Restaurado ao desmontar.
 * - `og:*` e `twitter:*`: substituídos. Restaurados ao desmontar.
 * - `<link rel="canonical">`: substituído. Restaurado ao desmontar.
 * - `meta[name=robots]`: actualizado se `noIndex=true`. Restaurado ao desmontar.
 * - `script[type="application/ld+json"][data-managed="patacerta-page"]`:
 *   removido ao desmontar (só vive enquanto a página está montada).
 *
 * Usar `usePageMeta({ ... })` em CADA página pública (incluindo NotFound
 * com `noIndex: true`) para evitar que o título/descrição estáticos do
 * `index.html` "vazem" para outras rotas.
 */
export interface PageMetaOptions {
  /** Título da página. O sufixo " — PataCerta" é adicionado automaticamente se não estiver presente. */
  title: string
  description?: string
  /** Path absoluto do canónico (ex: `/criador/42`). Default: pathname actual. */
  canonicalPath?: string
  /** Imagem para og:image / twitter:image. URL absoluta ou path. Default: og-image.svg. */
  imageUrl?: string
  /** og:type. Default: 'website'. Usar 'article' para páginas de detalhe. */
  type?: string
  /** Bloquear indexação (auth, 404, área pessoal). Default: false. */
  noIndex?: boolean
  /** JSON-LD structured data. Pode ser um objecto ou array de objectos. */
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

function withSiteSuffix(title: string): string {
  if (title.includes(SITE_NAME)) return title
  return `${title} — ${SITE_NAME}`
}

export function usePageMeta(options: PageMetaOptions): void {
  const { title, description, canonicalPath, imageUrl, type = 'website', noIndex, jsonLd } = options

  useEffect(() => {
    const finalTitle = withSiteSuffix(title)
    const finalImage = imageUrl ? absoluteUrl(imageUrl) : DEFAULT_OG_IMAGE
    const finalCanonical = canonicalUrlFromPath(canonicalPath ?? window.location.pathname)

    const previousTitle = document.title
    const metaSnapshots = new Map<HTMLMetaElement, string | null>()
    const linkSnapshots = new Map<HTMLLinkElement, string | null>()

    function setMeta(el: HTMLMetaElement, value: string | undefined) {
      if (!metaSnapshots.has(el)) metaSnapshots.set(el, el.getAttribute('content'))
      el.setAttribute('content', value ?? '')
    }
    function setLink(el: HTMLLinkElement, value: string) {
      if (!linkSnapshots.has(el)) linkSnapshots.set(el, el.getAttribute('href'))
      el.setAttribute('href', value)
    }

    document.title = finalTitle

    if (description !== undefined) {
      setMeta(ensureMetaByName('description'), description)
    }
    if (noIndex) {
      setMeta(ensureMetaByName('robots'), 'noindex,nofollow')
    }

    // Open Graph
    setMeta(ensureMetaByProperty('og:title'), finalTitle)
    if (description !== undefined) {
      setMeta(ensureMetaByProperty('og:description'), description)
    }
    setMeta(ensureMetaByProperty('og:image'), finalImage)
    setMeta(ensureMetaByProperty('og:url'), finalCanonical)
    setMeta(ensureMetaByProperty('og:type'), type)

    // Twitter
    setMeta(ensureMetaByName('twitter:title'), finalTitle)
    if (description !== undefined) {
      setMeta(ensureMetaByName('twitter:description'), description)
    }
    setMeta(ensureMetaByName('twitter:image'), finalImage)

    // Canonical
    setLink(ensureCanonical(), finalCanonical)

    // JSON-LD (managed: removido ao desmontar)
    const jsonLdElements: HTMLScriptElement[] = []
    if (jsonLd) {
      const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
      for (const item of items) {
        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.setAttribute('data-managed', 'patacerta-page')
        script.textContent = JSON.stringify(item)
        document.head.appendChild(script)
        jsonLdElements.push(script)
      }
    }

    return () => {
      document.title = previousTitle
      metaSnapshots.forEach((prev, el) => {
        if (prev === null) {
          el.removeAttribute('content')
        } else {
          el.setAttribute('content', prev)
        }
      })
      linkSnapshots.forEach((prev, el) => {
        if (prev === null) {
          el.removeAttribute('href')
        } else {
          el.setAttribute('href', prev)
        }
      })
      for (const el of jsonLdElements) el.remove()
    }
  }, [title, description, canonicalPath, imageUrl, type, noIndex, jsonLd])
}
