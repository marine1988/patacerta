import { useRef, useState, useEffect, type ReactNode } from 'react'

interface FeaturedCarouselProps {
  eyebrow: string
  title: string
  emptyMessage?: string
  isLoading?: boolean
  children: ReactNode
  /** Quantos skeletons mostrar enquanto carrega. */
  skeletonCount?: number
  skeleton?: ReactNode
}

/**
 * Container de scroll horizontal estilo OLX para destaques na homepage.
 *
 * - mobile: swipe nativo, sem setas (poupa espaco)
 * - desktop: setas << >> que aparecem quando ha overflow
 * - snap por item para que cada card encaixe ao parar
 *
 * Os cards sao passados como children — cada um deve ter largura propria
 * (recomendado: w-72 ou w-80 com flex-shrink-0).
 */
export function FeaturedCarousel({
  eyebrow,
  title,
  emptyMessage = 'Nada por aqui de momento.',
  isLoading,
  children,
  skeletonCount = 4,
  skeleton,
}: FeaturedCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  // Recalcula visibilidade das setas quando o conteudo muda ou ao fazer scroll.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const update = () => {
      setCanLeft(el.scrollLeft > 4)
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [children, isLoading])

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    // Avanca aproximadamente 80% da largura visivel.
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : children != null && children !== false

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h2 className="font-serif text-2xl text-ink sm:text-3xl">{title}</h2>
        </div>

        {/* Setas desktop apenas */}
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            className="flex h-9 w-9 items-center justify-center border border-line bg-surface text-ink transition-colors hover:border-caramel-500 hover:text-caramel-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Seguinte"
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            className="flex h-9 w-9 items-center justify-center border border-line bg-surface text-ink transition-colors hover:border-caramel-500 hover:text-caramel-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative -mx-6 lg:-mx-8">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 scrollbar-hidden lg:px-8"
          style={{ scrollbarWidth: 'none' }}
        >
          {isLoading ? (
            Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} className="w-72 flex-shrink-0 snap-start sm:w-80">
                {skeleton}
              </div>
            ))
          ) : hasChildren ? (
            children
          ) : (
            <div className="w-full py-12 text-center text-sm italic text-muted">{emptyMessage}</div>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Badge subtil "Destaque" para items promovidos. Posicionar absolutely
 * dentro do card pelo consumidor.
 */
export function FeaturedBadge() {
  return (
    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-sm bg-caramel-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-caps text-white shadow-sm">
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      Destaque
    </span>
  )
}
