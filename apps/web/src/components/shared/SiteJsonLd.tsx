import { useEffect, useRef } from 'react'
import { organizationJsonLd, websiteJsonLd } from '../../lib/jsonld'

/**
 * Injecta Organization + WebSite JSON-LD globalmente em todas as páginas,
 * usando `SITE_URL` (que respeita `VITE_PUBLIC_URL` por ambiente).
 *
 * Estratégia: os scripts são criados uma única vez (lazy init) e nunca
 * removidos do DOM. Isto elimina o bug de "Failed to execute removeChild on
 * Node" que ocorria quando o React desmontava o componente e o cleanup
 * tentava remover elementos que já não estavam no DOM.
 *
 * O `textContent` é (re)escrito em **cada** execução do efeito, não só na
 * criação, e o cleanup NÃO limpa o conteúdo. Isto é obrigatório: em
 * `React.StrictMode` o efeito corre montar → cleanup → montar. Se o cleanup
 * limpasse o texto e a remontagem saltasse a escrita (porque os elementos já
 * existem), os scripts ficariam permanentemente vazios e `JSON.parse`
 * rebentava com "Unexpected end of JSON input" — Organization/WebSite
 * desapareceriam do structured data de todas as páginas.
 */
export function SiteJsonLd() {
  const elementsRef = useRef<HTMLScriptElement[]>([])

  useEffect(() => {
    // Lazy init: criar scripts uma única vez
    if (elementsRef.current.length === 0) {
      for (let i = 0; i < 2; i++) {
        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.setAttribute('data-managed', 'patacerta-site')
        document.head.appendChild(script)
        elementsRef.current.push(script)
      }
    }

    // Escrever o conteúdo em cada execução (idempotente): garante que uma
    // remontagem — ou um cleanup anterior que limpou o texto — volte a ter
    // JSON-LD válido.
    const items = [organizationJsonLd(), websiteJsonLd()]
    elementsRef.current.forEach((script, idx) => {
      script.textContent = JSON.stringify(items[idx])
    })

    // Sem cleanup a propósito: o componente vive durante toda a sessão
    // (montado em App.tsx) e o objectivo é manter os scripts no DOM com
    // conteúdo válido.
  }, [])

  return null
}
