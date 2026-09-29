import { useState, useCallback, useEffect, useRef } from 'react'

// ─── Dados dos slides ──────────────────────────────────────────────
// Raças populares e reconhecíveis, todas com imagem em /public/breeds/.
// As percentagens são exemplos ilustrativos de compatibilidade.

interface BreedSlide {
  name: string
  image: string
  match: number
}

const BREED_SLIDES: BreedSlide[] = [
  { name: 'Cocker Spaniel Americano', image: '/breeds/cocker-spaniel-americano.jpg', match: 94 },
  { name: 'Pastor Belga', image: '/breeds/cao-pastor-belga.jpg', match: 87 },
  { name: 'Basenji', image: '/breeds/basenji.jpg', match: 82 },
  { name: 'Basset Hound', image: '/breeds/basset-hound.jpg', match: 76 },
  { name: 'Bichon Frisé', image: '/breeds/bichon-frise.jpg', match: 71 },
]

/** Tempo sem interacção manual após o qual o auto-play retoma. */
const RESUME_DELAY_MS = 10_000

// ─── Componente ────────────────────────────────────────────────────

export function BreedSlider() {
  const [active, setActive] = useState(0)
  const [hoverPaused, setHoverPaused] = useState(false)
  const [interactionPaused, setInteractionPaused] = useState(false)
  const isPaused = hoverPaused || interactionPaused
  const total = BREED_SLIDES.length
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback(
    (index: number) => {
      setActive(((index % total) + total) % total)
    },
    [total],
  )

  const goNext = useCallback(() => goTo(active + 1), [active, goTo])
  const goPrev = useCallback(() => goTo(active - 1), [active, goTo])

  // Regista interacção manual (clique em dots/setas) e pausa o auto-play.
  const handleUserInteraction = useCallback(() => {
    setInteractionPaused(true)
  }, [])

  // Auto-play: avança a cada 5s, pausado no hover/foco ou interacção manual.
  useEffect(() => {
    if (isPaused) return
    intervalRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % total)
    }, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPaused, total])

  // Retoma auto-play após 10s sem interacção manual.
  useEffect(() => {
    if (!interactionPaused) return
    const timeout = setTimeout(() => {
      setInteractionPaused(false)
    }, RESUME_DELAY_MS)
    return () => clearTimeout(timeout)
  }, [interactionPaused])

  const current = BREED_SLIDES[active]

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Exemplos de raças compatíveis"
      data-testid="breed-slider"
      className="group relative"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
    >
      {/* Slides — fade transition */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line">
        {BREED_SLIDES.map((slide, idx) => (
          <img
            key={slide.name}
            src={slide.image}
            alt={slide.name}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              idx === active ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={idx !== active}
            loading={idx === 0 ? 'eager' : 'lazy'}
          />
        ))}

        {/* Card de resultado sobreposto */}
        <div
          className="absolute bottom-4 left-4 rounded-lg border border-line bg-bg/95 px-4 py-3 shadow-sm backdrop-blur-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-[11px] font-medium uppercase tracking-caps text-muted">
            Exemplo de resultado
          </p>
          <p className="mt-1 font-serif text-sm text-ink">
            {current.name} · {current.match}% match
          </p>
        </div>
      </div>

      {/* Setas de navegação */}
      <button
        type="button"
        onClick={() => { handleUserInteraction(); goPrev() }}
        aria-label="Raça anterior"
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-bg/90 p-2 text-ink opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:border-caramel-500 hover:text-caramel-500 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => { handleUserInteraction(); goNext() }}
        aria-label="Próxima raça"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-bg/90 p-2 text-ink opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:border-caramel-500 hover:text-caramel-500 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Dots de navegação */}
      <div
        className="mt-3 flex items-center justify-center gap-2"
        role="tablist"
        aria-label="Selecionar raça"
      >
        {BREED_SLIDES.map((slide, idx) => (
          <button
            key={slide.name}
            type="button"
            role="tab"
            aria-selected={idx === active}
            aria-label={`Ver ${slide.name}`}
            onClick={() => { handleUserInteraction(); goTo(idx) }}
            className={`h-2 rounded-full transition-all duration-300 ${
              idx === active ? 'w-6 bg-caramel-500' : 'w-2 bg-line hover:bg-caramel-500/50'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
