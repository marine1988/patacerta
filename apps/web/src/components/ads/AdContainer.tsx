// ============================================
// PataCerta — AdContainer
// ============================================
//
// Wrapper de UI para um slot AdSense. Adiciona o rótulo "Publicidade"
// (transparência exigida pelas políticas do Google e boa prática
// editorial) e respeita o gating de páginas sensíveis via
// `useAdsAllowed`.
//
// Uso típico:
//
//   <AdContainer slot="1234567890" placement="homepage-mid" />
//
// A altura mínima evita layout shift enquanto o slot ainda não pintou
// (o Google só decide o tamanho depois do `push`).

import { useLocation } from 'react-router-dom'
import { AdSlot, adsEnabled } from './AdSlot'
import { useAdsAllowed } from './useAdsAllowed'

interface AdContainerProps {
  /** Slot ID do AdSense (data-ad-slot). */
  slot: string
  /** Identificador editorial — ajuda em logs/analytics futuros. */
  placement: string
  /** Altura mínima reservada para evitar CLS. Default 90 (mobile leaderboard). */
  minHeight?: number
  className?: string
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal' | 'vertical'
}

export function AdContainer({
  slot,
  placement,
  minHeight = 90,
  className,
  format = 'auto',
}: AdContainerProps) {
  const { pathname } = useLocation()
  const allowed = useAdsAllowed(pathname)

  // Sem ID configurado / flag desligada / em página excluída — não
  // mostramos sequer o rótulo "Publicidade" (caso contrário ficaria um
  // bloco vazio com legenda).
  if (!allowed) return null
  if (!adsEnabled() || !slot) return null

  return (
    <aside
      aria-label="Publicidade"
      data-ad-placement={placement}
      className={`my-6 ${className ?? ''}`.trim()}
      style={{ minHeight }}
    >
      <p className="mb-1 text-[10px] font-medium uppercase tracking-caps text-subtle">
        Publicidade
      </p>
      <AdSlot slot={slot} format={format} />
    </aside>
  )
}
