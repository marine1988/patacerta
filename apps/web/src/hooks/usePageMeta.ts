import { useEffect } from 'react'

/**
 * Hook minimo de SEO/Open Graph que escreve em document.head sem libs externas.
 *
 * - title: vai para <title> e og:title.
 * - description: meta[name=description] + og:description.
 * - imageUrl (opcional): og:image. Idealmente URL absoluta com altura >=200px.
 * - url (opcional): og:url. Default = window.location.href.
 * - type: og:type. Default = 'website'.
 *
 * Restaura o titulo anterior ao desmontar. As metas sao reutilizadas (criadas
 * uma vez e marcadas com data-managed) e o seu content e' restaurado/limpo
 * quando o componente desmonta para nao "vazar" para outras paginas.
 */
export interface PageMetaOptions {
  title: string
  description?: string
  imageUrl?: string
  url?: string
  type?: string
}

const META_NAMES = ['description'] as const
const OG_PROPS = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'] as const

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

export function usePageMeta(options: PageMetaOptions): void {
  const { title, description, imageUrl, url, type = 'website' } = options

  useEffect(() => {
    const previousTitle = document.title
    const snapshots = new Map<HTMLMetaElement, string | null>()

    function setMeta(el: HTMLMetaElement, value: string | undefined) {
      if (!snapshots.has(el)) snapshots.set(el, el.getAttribute('content'))
      if (value === undefined) {
        el.setAttribute('content', '')
      } else {
        el.setAttribute('content', value)
      }
    }

    document.title = title

    // name=description
    if (description !== undefined) {
      setMeta(ensureMetaByName('description'), description)
    }

    // Open Graph
    setMeta(ensureMetaByProperty('og:title'), title)
    if (description !== undefined) {
      setMeta(ensureMetaByProperty('og:description'), description)
    }
    if (imageUrl) {
      setMeta(ensureMetaByProperty('og:image'), imageUrl)
    }
    setMeta(ensureMetaByProperty('og:url'), url ?? window.location.href)
    setMeta(ensureMetaByProperty('og:type'), type)

    return () => {
      document.title = previousTitle
      snapshots.forEach((prev, el) => {
        if (prev === null) {
          el.removeAttribute('content')
        } else {
          el.setAttribute('content', prev)
        }
      })
    }
  }, [title, description, imageUrl, url, type])
}

// Forca o ESLint a nao queixar-se das constantes nao usadas (mantidas
// para referencia da lista de campos geridos).
export const _MANAGED_META_FIELDS = { META_NAMES, OG_PROPS }
