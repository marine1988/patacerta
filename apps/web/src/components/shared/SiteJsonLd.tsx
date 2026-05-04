import { useEffect } from 'react'
import { organizationJsonLd, websiteJsonLd } from '../../lib/jsonld'

/**
 * Injecta Organization + WebSite JSON-LD globalmente em todas as páginas,
 * usando `SITE_URL` (que respeita `VITE_PUBLIC_URL` por ambiente).
 *
 * Substitui os blocos JSON-LD estáticos que existiam em `index.html` (que
 * tinham URLs hard-coded para `https://patacerta.pt` e por isso não se
 * adaptavam a stage). Monta-se uma única vez ao iniciar a app e nunca é
 * desmontado, pelo que os scripts vivem durante toda a sessão sem flicker.
 */
export function SiteJsonLd() {
  useEffect(() => {
    const items = [organizationJsonLd(), websiteJsonLd()]
    const elements: HTMLScriptElement[] = []
    for (const item of items) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.setAttribute('data-managed', 'patacerta-site')
      script.textContent = JSON.stringify(item)
      document.head.appendChild(script)
      elements.push(script)
    }
    return () => {
      for (const el of elements) el.remove()
    }
  }, [])

  return null
}
