import type { CSSProperties, HTMLAttributes } from 'react'

/**
 * Primitivos de skeleton reutilizaveis. Mantem o mesmo look (`animate-pulse`
 * + `bg-gray-200`) ja usado em `BreederCard`, `ServiceCard` e `HomePage`
 * para consistencia visual em toda a app.
 *
 * Nota: nao usamos `bg-surface-alt` excepto em pontos que estao sobre
 * fundo `bg-surface` (claro) — para evitar contraste nulo. O `bg-gray-200`
 * funciona bem em ambos os temas (light/dark) com o `animate-pulse`.
 */

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** Altura tailwind (ex.: 'h-4', 'h-5'). Default 'h-4'. */
  height?: string
  /** Largura tailwind (ex.: 'w-full', 'w-1/2'). Default 'w-full'. */
  width?: string
  /** Border radius (ex.: 'rounded', 'rounded-full'). Default 'rounded'. */
  rounded?: string
  /** Aplicar animate-pulse no proprio elemento (true) ou herdar do pai (false). Default true. */
  animate?: boolean
}

/**
 * Bloco rectangular generico. Use directamente para barras de texto,
 * placeholders de imagem (com aspect-ratio), botoes, etc.
 *
 * Exemplos:
 *   <Skeleton height="h-4" width="w-32" />               // bar de texto
 *   <Skeleton height="h-12" width="w-12" rounded="rounded-full" /> // avatar
 *   <Skeleton className="aspect-[4/3] w-full" />        // imagem card
 */
export function Skeleton({
  height = 'h-4',
  width = 'w-full',
  rounded = 'rounded',
  animate = true,
  className = '',
  ...rest
}: SkeletonProps) {
  const animateClass = animate ? 'animate-pulse' : ''
  return (
    <div
      aria-hidden="true"
      className={`${animateClass} ${height} ${width} ${rounded} bg-gray-200 ${className}`}
      {...rest}
    />
  )
}

/**
 * Linhas de texto stackadas com larguras decrescentes (mais natural que
 * todas iguais). Util para descricoes/biografias/parrafos.
 */
export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-5/6']
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`h-3 rounded bg-gray-200 ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton de uma linha de tabela admin generica. `cols` define quantas
 * "celulas" de placeholder mostrar. `widthHint` permite passar larguras
 * personalizadas por coluna (default distribuido).
 */
export function SkeletonRow({
  cols = 5,
  widthHints,
  className = '',
}: {
  cols?: number
  widthHints?: string[]
  className?: string
}) {
  const defaults = ['w-1/4', 'w-1/3', 'w-1/5', 'w-1/6', 'w-1/4', 'w-1/5']
  return (
    <div
      className={`flex items-center gap-4 border-b border-line/60 px-3 py-3 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className={`h-4 rounded bg-gray-200 ${widthHints?.[i] ?? defaults[i % defaults.length]}`}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton de avatar circular + duas linhas (usado em listas de threads,
 * reviews, search results, etc.). Configura tamanho via `size` (px).
 */
export function SkeletonAvatarLine({
  size = 40,
  lines = 2,
  className = '',
}: {
  size?: number
  lines?: number
  className?: string
}) {
  const sizeStyle: CSSProperties = { width: size, height: size }
  return (
    <div className={`flex items-start gap-3 ${className}`} aria-hidden="true">
      <div
        className="shrink-0 animate-pulse rounded-full bg-gray-200"
        style={sizeStyle}
      />
      <div className="flex-1 space-y-2 pt-1">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`h-3 animate-pulse rounded bg-gray-200 ${i === 0 ? 'w-1/2' : 'w-3/4'}`}
          />
        ))}
      </div>
    </div>
  )
}
