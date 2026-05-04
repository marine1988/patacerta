import { useEffect } from 'react'
import { itemListJsonLd, type ItemListEntry } from '../lib/jsonld'

/**
 * Injecta um único `ItemList` JSON-LD em `document.head` com cleanup
 * automático, distinto do JSON-LD global (`SiteJsonLd`) e per-page
 * (`usePageMeta` -> `data-managed="patacerta-page"`).
 *
 * Usado em listagens (pesquisa, mapas) onde os dados vêm de queries
 * assíncronas e mudam com filtros/paginação. Re-renderiza o JSON-LD
 * sempre que `items` muda, removendo o anterior.
 *
 * Boas práticas:
 * - Limitar `items` a 20-50 entradas (recomendação Google: <= 100,
 *   mas payloads grandes não trazem benefício SEO adicional).
 * - Só emitir quando há resultados (`items.length > 0`).
 */
export function useItemListJsonLd(items: ItemListEntry[], listName?: string): void {
  // Serializar dependência: `items` muda de referência a cada render mas
  // o conteúdo pode ser estável. Comparar por valor evita re-injecções.
  const key = JSON.stringify({ items, listName })

  useEffect(() => {
    if (items.length === 0) return

    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.setAttribute('data-managed', 'patacerta-itemlist')
    script.textContent = JSON.stringify(itemListJsonLd(items, { name: listName }))
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
