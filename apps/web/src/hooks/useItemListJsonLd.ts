import { useEffect, useRef } from 'react'
import { itemListJsonLd, type ItemListEntry } from '../lib/jsonld'

/**
 * Injecta um único `ItemList` JSON-LD em `document.head` com cleanup
 * automático, distinto do JSON-LD global (`SiteJsonLd`) e per-page
 * (`usePageMeta` -> `data-managed="patacerta-page"`).
 *
 * Usado em listagens (pesquisa, mapas) onde os dados vêm de queries
 * assíncronas e mudam com filtros/paginação. Re-renderiza o JSON-LD
 * sempre que `items` muda.
 *
 * Estratégia: o elemento é criado uma única vez (lazy init) e **nunca
 * removido do DOM** — apenas o `textContent` é actualizado. O cleanup
 * limpa o conteúdo em vez de remover o nó, o que elimina o bug de
 * "Failed to execute removeChild on Node" que ocorria quando o React
 * desmontava/remontava componentes e o cleanup tentava remover um
 * elemento que já não estava no DOM (mesma correcção de usePageMeta).
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

  const scriptRef = useRef<HTMLScriptElement | null>(null)

  useEffect(() => {
    if (items.length === 0) return

    // Lazy init: criar o script uma única vez
    if (!scriptRef.current) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.setAttribute('data-managed', 'patacerta-itemlist')
      document.head.appendChild(script)
      scriptRef.current = script
    }

    scriptRef.current.textContent = JSON.stringify(itemListJsonLd(items, { name: listName }))

    // Cleanup: limpar conteúdo (sem remover o elemento do DOM)
    return () => {
      if (scriptRef.current) {
        scriptRef.current.textContent = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
