// ============================================
// PataCerta — AdSense integration
// ============================================
//
// Wrapper do Google AdSense. Renderiza um slot `<ins class="adsbygoogle">`
// e carrega o script global `adsbygoogle.js` lazy (uma única vez por
// sessão). Sem ID configurado ou com flag desligada, não renderiza nada
// — comportamento seguro em dev/stage.
//
// GDPR: enquanto não tivermos um Consent Management Platform (CMP), os
// anúncios são servidos em modo NON-PERSONALIZED (sem cookies de
// tracking individual), conforme exigido pelo RGPD em PT/UE. A flag
// `requestNonPersonalizedAds = 1` é definida no push() de cada slot.
//
// Quando integrarmos um CMP (ex: Google-funded CMP, Cookiebot,
// Didomi), substituir `nonPersonalized` pelo sinal real do utilizador.

import { useEffect, useRef } from 'react'
const CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID ?? ''
const ENABLED =
  import.meta.env.VITE_ADSENSE_ENABLED === 'true' || import.meta.env.VITE_ADSENSE_ENABLED === '1'

/**
 * `true` quando a integração AdSense está activa (env var ligada e
 * client ID definido). Permite a outros componentes UI (ex:
 * `AdContainer`) curtocircuitar a render quando não há nada a mostrar.
 */
export function adsEnabled(): boolean {
  return ENABLED && CLIENT_ID.length > 0
}

const SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>> & {
      requestNonPersonalizedAds?: number
    }
  }
}

let scriptInjected = false

function ensureScript(): void {
  if (typeof window === 'undefined') return
  if (scriptInjected) return
  if (document.querySelector(`script[src*="adsbygoogle.js"]`)) {
    scriptInjected = true
    return
  }
  const s = document.createElement('script')
  s.async = true
  s.src = `${SCRIPT_SRC}?client=${encodeURIComponent(CLIENT_ID)}`
  s.crossOrigin = 'anonymous'
  document.head.appendChild(s)
  scriptInjected = true
}

interface AdSlotProps {
  /** Slot ID do AdSense (data-ad-slot), criado no painel do publisher. */
  slot: string
  /** Formato responsive recomendado pelo Google. */
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal' | 'vertical'
  /** "true" para responsive full-width. Default: true. */
  responsive?: boolean
  /** Layout key (apenas para in-feed/in-article). */
  layout?: string
  layoutKey?: string
  /** Estilo override do <ins>. Por defeito display:block. */
  style?: React.CSSProperties
  className?: string
}

/**
 * Componente de slot AdSense. Não renderiza nada se a integração
 * estiver desligada ou sem client ID. Em mobile usa `format="auto"`
 * para o Google escolher o melhor tamanho disponível.
 */
export function AdSlot({
  slot,
  format = 'auto',
  responsive = true,
  layout,
  layoutKey,
  style,
  className,
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement | null>(null)
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!ENABLED || !CLIENT_ID) return
    if (!insRef.current) return
    if (pushedRef.current) return

    ensureScript()

    try {
      const queue = (window.adsbygoogle = window.adsbygoogle || [])
      // Modo non-personalized até existir um CMP integrado.
      queue.requestNonPersonalizedAds = 1
      queue.push({})
      pushedRef.current = true
    } catch (err) {
      // Em produção pode falhar se o ad-blocker remover o script.
      // Não há nada a fazer — silenciar.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[AdSlot] push falhou', err)
      }
    }
  }, [slot])

  if (!ENABLED || !CLIENT_ID) return null

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle ${className ?? ''}`.trim()}
      style={{ display: 'block', ...style }}
      data-ad-client={CLIENT_ID}
      data-ad-slot={slot}
      data-ad-format={format}
      data-ad-layout={layout}
      data-ad-layout-key={layoutKey}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  )
}
