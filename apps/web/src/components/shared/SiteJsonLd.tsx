import { useEffect, useRef } from 'react'
import { organizationJsonLd, websiteJsonLd } from '../../lib/jsonld'

/**
 * Injecta Organization + WebSite JSON-LD globalmente em todas as páginas,
 * usando `SITE_URL` (que respeita `VITE_PUBLIC_URL` por ambiente).
 *
 * Estratégia: os scripts são criados uma única vez (lazy init) e nunca
 * removidos do DOM. O cleanup apenas limpa o conteúdo. Isto elimina o bug
 * de "Failed to execute removeChild on Node" que ocorria quando o React
 * desmontava o componente e o cleanup tentava remover elementos que já
 * não estavam no DOM.
 */
export function SiteJsonLd() {
  const elementsRef = useRef<HTMLScriptElement[]>([])

  useEffect(() => {
    // Lazy init: criar scripts uma única vez
    if (elementsRef.current.length === 0) {
      const items = [organizationJsonLd(), websiteJsonLd()]
      for (const item of items) {
        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.setAttribute('data-managed', 'patacerta-site')
        script.textContent = JSON.stringify(item)
        document.head.appendChild(script)
        elementsRef.current.push(script)
      }
    }

    // Cleanup: limpar conteúdo (sem remover elementos do DOM)
    return () => {
      for (const el of elementsRef.current) {
        el.textContent = ''
      }
    }
  }, [])

  return null
}
