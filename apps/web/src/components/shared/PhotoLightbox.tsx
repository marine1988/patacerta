import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'

interface PhotoLightboxProps {
  isOpen: boolean
  onClose: () => void
  photos: Array<{ id: number; url: string }>
  /** Indice da foto inicial (controlled). */
  startIndex: number
  /** Texto alternativo (titulo do anuncio). */
  alt: string
}

const SWIPE_THRESHOLD = 60

/**
 * Visualizador fullscreen para galerias de fotos.
 *
 * - Esc fecha; setas <- e -> navegam.
 * - Swipe horizontal em mobile (touchstart + touchend, sem libs).
 * - Click no overlay (fora da imagem) fecha.
 * - Bloqueia scroll do body enquanto aberto.
 *
 * Sem dependencias externas — segue o padrao do `Modal` do projecto.
 */
export function PhotoLightbox({ isOpen, onClose, photos, startIndex, alt }: PhotoLightboxProps) {
  const [index, setIndex] = useState(startIndex)
  const overlayRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)

  // Sync com prop quando reabre.
  useEffect(() => {
    if (isOpen) setIndex(startIndex)
  }, [isOpen, startIndex])

  useEffect(() => {
    if (!isOpen) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setIndex((i) => (i > 0 ? i - 1 : i))
      else if (e.key === 'ArrowRight') setIndex((i) => (i < photos.length - 1 ? i + 1 : i))
    }

    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose, photos.length])

  if (!isOpen || photos.length === 0) return null

  const current = photos[Math.max(0, Math.min(index, photos.length - 1))]
  const canPrev = index > 0
  const canNext = index < photos.length - 1

  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      if (dx < 0 && canNext) setIndex((i) => i + 1)
      else if (dx > 0 && canPrev) setIndex((i) => i - 1)
    }
    touchStartX.current = null
  }

  // Renderizado em portal para evitar que ancestrais com transform/filter
  // confinem o `position: fixed` ou criem um stacking context que esconda
  // o overlay por tras de elementos da pagina.
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Galeria — ${alt}`}
    >
      {/* Botao fechar */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
        aria-label="Fechar"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Contador */}
      {photos.length > 1 && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-sm text-white">
          {index + 1} / {photos.length}
        </div>
      )}

      {/* Anterior */}
      {canPrev && (
        <button
          type="button"
          onClick={() => setIndex((i) => i - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 sm:left-6"
          aria-label="Foto anterior"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Imagem */}
      <img
        src={current.url}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] select-none object-contain"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        draggable={false}
      />

      {/* Seguinte */}
      {canNext && (
        <button
          type="button"
          onClick={() => setIndex((i) => i + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 sm:right-6"
          aria-label="Foto seguinte"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>,
    document.body,
  )
}
