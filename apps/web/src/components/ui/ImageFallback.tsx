import { useState } from 'react'

/**
 * Variantes do placeholder. Cada uma desenha um SVG editorial coerente
 * com a paleta caramel/cream do PataCerta. Inline (sem network) para
 * garantir que a fallback aparece mesmo offline ou se algum CDN cair.
 */
export type ImageFallbackVariant = 'breeder' | 'service' | 'breed' | 'generic'

interface ImageFallbackProps {
  /** URL da imagem real; quando null/undefined ou onError, mostra placeholder. */
  src?: string | null
  /** Alt text quando ha imagem; aria-label quando ha placeholder. */
  alt: string
  /** Tipo do conteudo — escolhe o icone editorial. */
  variant?: ImageFallbackVariant
  /** Classes do contentor exterior (aspect ratio, dimensoes). */
  className?: string
  /** Lazy load por default. */
  loading?: 'lazy' | 'eager'
}

/**
 * Wrapper unico para imagens com fallback gracioso. Substitui a string
 * "sem foto" anteriormente usada em BreederCard/ServiceCard.
 *
 * Comportamento:
 * - src valido → <img loading="lazy"> + onError cai para o SVG
 * - src null/undefined → mostra SVG directamente (sem request)
 *
 * Decisao: SVG inline (zero requests, zero CLS, funciona offline) em vez
 * de PNG estatico em /public. O custo de markup e' ~300B por placeholder
 * mas evita um round-trip extra. Para listings com 20+ cards isto e' net
 * positivo vs servir um placeholder.png.
 */
export function ImageFallback({
  src,
  alt,
  variant = 'generic',
  className = '',
  loading = 'lazy',
}: ImageFallbackProps) {
  const [errored, setErrored] = useState(false)
  const showPlaceholder = !src || errored

  if (showPlaceholder) {
    return (
      <div
        className={`flex items-center justify-center bg-caramel-100/50 ${className}`}
        role="img"
        aria-label={alt}
      >
        <PlaceholderIcon variant={variant} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={`h-full w-full object-cover ${className}`}
      loading={loading}
    />
  )
}

/**
 * Apenas o SVG (sem contentor) — util quando o caller ja tem o seu
 * wrapper de aspect-ratio (ex.: SimuladorRacaPage com bg proprio).
 */
export function PlaceholderIcon({ variant = 'generic' }: { variant?: ImageFallbackVariant }) {
  const common = 'h-12 w-12 text-caramel-500/50'
  switch (variant) {
    case 'breeder':
    case 'breed':
      // Silhueta cao — variante mais reconhecivel para perfis de criadores
      // e cards de racas. Pega editorial caramel.
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M4.5 9.5c0-1.5 1-3 2.5-3.5l1-2c.2-.4.6-.5 1-.3l1.2.6c.3.2.5.5.5.9v1.4c.6-.2 1.3-.3 2.3-.3s1.7.1 2.3.3V5c0-.4.2-.7.5-.9l1.2-.6c.4-.2.8 0 1 .3l1 2c1.5.5 2.5 2 2.5 3.5v6c0 1.7-.8 3.2-2.1 4.1-.5.4-1.1.6-1.7.7l-.7.1c-.5.1-1 .1-1.5.1H10c-.5 0-1 0-1.5-.1l-.7-.1c-.6-.1-1.2-.3-1.7-.7C4.8 18.7 4 17.2 4 15.5v-6h.5z" />
        </svg>
      )
    case 'service':
      // Trela + osso — sugere passeio/cuidado sem ser literal demais.
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Patinha estilizada */}
          <circle cx="6" cy="9" r="1.6" fill="currentColor" />
          <circle cx="10" cy="6.5" r="1.6" fill="currentColor" />
          <circle cx="14" cy="6.5" r="1.6" fill="currentColor" />
          <circle cx="18" cy="9" r="1.6" fill="currentColor" />
          <path
            d="M9 13c0-1.8 1.4-3 3-3s3 1.2 3 3c0 1.5-1 2.3-1.5 3.2-.5.9-.5 1.8-1.5 1.8s-1-.9-1.5-1.8c-.5-.9-1.5-1.7-1.5-3.2z"
            fill="currentColor"
          />
        </svg>
      )
    case 'generic':
    default:
      // Patinha generica
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="9" r="1.8" />
          <circle cx="10" cy="6" r="1.8" />
          <circle cx="14" cy="6" r="1.8" />
          <circle cx="18" cy="9" r="1.8" />
          <path d="M9 14c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5c0 1.8-1 2.7-1.5 3.5-.5.8-.5 2-1.5 2s-1-1.2-1.5-2c-.5-.8-1.5-1.7-1.5-3.5z" />
        </svg>
      )
  }
}
