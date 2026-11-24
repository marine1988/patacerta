import { useId, useState } from 'react'

/**
 * Variantes do placeholder. Cada uma desenha um SVG editorial coerente
 * com a paleta caramel/cream do PataCerta. Inline (sem network) para
 * garantir que a fallback aparece mesmo offline ou se algum CDN cair.
 */
export type ImageFallbackVariant = 'breeder' | 'service' | 'breed' | 'generic'

/**
 * Escala do empty state:
 *  - `card`    — imagem principal de um card/listagem (4:3, 16:9);
 *  - `compact` — miniaturas (48–128 px) onde a ilustração grande partiria
 *                o layout. Mantém o mesmo desenho, só menor.
 */
export type ImageFallbackSize = 'card' | 'compact'

interface ImageFallbackProps {
  /** URL da imagem real; quando null/undefined ou onError, mostra placeholder. */
  src?: string | null
  /** Alt text quando ha imagem; parte do aria-label quando ha placeholder. */
  alt: string
  /** Tipo do conteudo — escolhe a ilustracao editorial. */
  variant?: ImageFallbackVariant
  /** Classes do contentor exterior (aspect ratio, dimensoes). */
  className?: string
  /** Classes extra so' para o `<img>` (transicoes de opacidade, etc.). */
  imgClassName?: string
  /** Lazy load por default. */
  loading?: 'lazy' | 'eager'
  /**
   * Microcopy opcional por baixo da ilustracao (ex.: "Sem fotografia").
   * Nunca usar para dizer "erro": o empty state e' editorial, nao um alerta.
   */
  label?: string
  /** Escala da ilustracao. Default `card`. */
  size?: ImageFallbackSize
  /** Callback de `load` da imagem real (spinners/opacidade progressiva). */
  onLoad?: () => void
  /**
   * Imagem puramente decorativa (o texto/botão em volta ja' descreve o
   * conteudo). O empty state fica `aria-hidden` em vez de anunciar um
   * `role="img"` redundante — equivale ao antigo `<img alt="">`.
   */
  decorative?: boolean
}

/**
 * Texto acessivel default por variante. Usado apenas quando nao ha `alt`
 * nem `label` — caso contrario o aria-label compoe-se com o que o caller
 * deu, para nunca ficar vazio (um `role="img"` sem nome e' ruido para AT).
 */
const DEFAULT_LABELS: Record<ImageFallbackVariant, string> = {
  breeder: 'Imagem ilustrativa de um criador',
  breed: 'Imagem ilustrativa de uma raça',
  service: 'Imagem ilustrativa de um serviço',
  generic: 'Imagem ilustrativa',
}

/**
 * Wrapper unico para imagens com fallback gracioso. Substitui a string
 * "sem foto" anteriormente usada em BreederCard/ServiceCard e cobre tambem
 * o caso "a URL existe mas devolve 404/HTML/timeout" via `onError`.
 *
 * Comportamento:
 * - src valido → <img loading="lazy" object-cover> + onError cai para o SVG
 * - src null/undefined ou erro → empty state editorial (SVG inline)
 *
 * Decisao: SVG inline (zero requests, zero CLS, funciona offline) em vez
 * de PNG estatico em /public. O custo de markup e' ~1 kB por placeholder
 * mas evita um round-trip extra. Para listings com 20+ cards isto e' net
 * positivo vs servir um placeholder.png.
 *
 * O empty state enche 100% do contentor (`h-full w-full`) — a proporcao
 * continua a ser a do wrapper do caller (aspect-[4/3], h-16 w-16, ...).
 */
export function ImageFallback({
  src,
  alt,
  variant = 'generic',
  className = '',
  imgClassName,
  loading = 'lazy',
  label,
  size = 'card',
  onLoad,
  decorative = false,
}: ImageFallbackProps) {
  const [errored, setErrored] = useState(false)
  const showPlaceholder = !src || errored
  const accessibleLabel =
    [alt?.trim(), label?.trim()].filter(Boolean).join(' — ') || DEFAULT_LABELS[variant]

  if (showPlaceholder) {
    const compact = size === 'compact'
    return (
      <div
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : accessibleLabel}
        aria-hidden={decorative ? true : undefined}
        data-testid="image-fallback"
        data-variant={variant}
        data-size={size}
        data-decorative={decorative ? 'true' : undefined}
        className={[
          'relative flex h-full w-full items-center justify-center overflow-hidden',
          'bg-gradient-to-br from-caramel-50 via-caramel-100 to-caramel-200/80',
          'dark:from-surface-alt dark:via-caramel-900/60 dark:to-caramel-800/50',
          className,
        ].join(' ')}
      >
        <FallbackPattern />
        <div
          className={`relative flex flex-col items-center justify-center text-center ${
            compact ? 'gap-0' : 'gap-2 px-2'
          }`}
        >
          {compact ? (
            <PlaceholderIcon variant={variant} size="compact" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-surface/50 ring-1 ring-caramel-300/50 dark:bg-surface/10 dark:ring-caramel-300/25">
              <PlaceholderIcon variant={variant} size="card" />
            </span>
          )}
          {label && (
            <span
              className={`font-medium text-caramel-800 dark:text-caramel-100/80 ${
                compact ? 'text-[10px] leading-tight' : 'text-xs'
              }`}
            >
              {label}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      onLoad={onLoad}
      className={`h-full w-full object-cover ${className} ${imgClassName ?? ''}`}
      loading={loading}
    />
  )
}

/**
 * Padrao de pontos discreto (SVG inline, aria-hidden). Da' textura ao
 * gradiente para o empty state ler como decisao de design e nao como
 * area vazia. `useId` mantem os `<pattern>` unicos quando ha varios cards
 * na mesma pagina.
 */
function FallbackPattern() {
  const patternId = useId()
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-caramel-500/15 dark:text-caramel-200/10"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}

/**
 * Apenas o SVG (sem contentor) — util quando o caller ja tem o seu
 * wrapper de aspect-ratio (ex.: SimuladorRacaPage com bg proprio).
 */
export function PlaceholderIcon({
  variant = 'generic',
  size = 'card',
}: {
  variant?: ImageFallbackVariant
  size?: ImageFallbackSize
}) {
  const common =
    size === 'compact'
      ? 'h-6 w-6 text-caramel-600/70 dark:text-caramel-200/50'
      : 'h-11 w-11 text-caramel-600/70 dark:text-caramel-200/60'
  switch (variant) {
    case 'breeder':
    case 'breed':
      // Silhueta cao — variante mais reconhecivel para perfis de criadores
      // e cards de racas.
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4.5 9.5c0-1.5 1-3 2.5-3.5l1-2c.2-.4.6-.5 1-.3l1.2.6c.3.2.5.5.5.9v1.4c.6-.2 1.3-.3 2.3-.3s1.7.1 2.3.3V5c0-.4.2-.7.5-.9l1.2-.6c.4-.2.8 0 1 .3l1 2c1.5.5 2.5 2 2.5 3.5v6c0 1.7-.8 3.2-2.1 4.1-.5.4-1.1.6-1.7.7l-.7.1c-.5.1-1 .1-1.5.1H10c-.5 0-1 0-1.5-.1l-.7-.1c-.6-.1-1.2-.3-1.7-.7C4.8 18.7 4 17.2 4 15.5v-6h.5z" />
        </svg>
      )
    case 'service':
      // Patinha + trela — sugere passeio/cuidado sem ser literal demais.
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
          focusable="false"
        >
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
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="6" cy="9" r="1.8" />
          <circle cx="10" cy="6" r="1.8" />
          <circle cx="14" cy="6" r="1.8" />
          <circle cx="18" cy="9" r="1.8" />
          <path d="M9 14c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5c0 1.8-1 2.7-1.5 3.5-.5.8-.5 2-1.5 2s-1-1.2-1.5-2c-.5-.8-1.5-1.7-1.5-3.5z" />
        </svg>
      )
  }
}
