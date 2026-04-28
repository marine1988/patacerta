// ============================================
// PataCerta — PhotoGalleryManager (shared)
// ============================================
//
// Gestor visual de galeria de fotos com drag-reorder + botoes <-/->.
// Usado pelo BreederTab e ServicesTab. Parametrizado por max, label
// e flag `requireAtLeastOne` (servicos exigem 1 foto para publicar;
// criadores nao).
//
// O componente e' apenas UI: as mutations (upload/delete/reorder)
// vivem no consumidor. Recebe `photos` (em ordem actual) e callbacks.

import { useState, type ChangeEvent, type DragEvent, type RefObject } from 'react'
import { Card } from '../ui/Card'

export interface GalleryPhoto {
  id: number
  url: string
  sortOrder: number
}

interface PhotoGalleryManagerProps {
  photos: GalleryPhoto[]
  max: number
  /** "Fotos do servico" / "Galeria do criador" etc. */
  title?: string
  /** Mensagem em baixo quando nao ha fotos. */
  emptyHint?: string
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void
  uploadInputRef: RefObject<HTMLInputElement>
  isUploading: boolean
  uploadMsg: { type: 'success' | 'error'; text: string } | null
  onDelete: (photoId: number) => void
  onReorder: (photoIds: number[]) => void
  /**
   * When false, renders the gallery without the surrounding Card so it can
   * be embedded as a sub-section inside a parent card. Defaults to true to
   * preserve the standalone behaviour used elsewhere.
   */
  wrapInCard?: boolean
  /**
   * When false, hides the internal title row (title + reorder hint). Useful
   * when the gallery is embedded inside a parent component that already
   * provides a heading (e.g. an AccordionSection).
   */
  showHeader?: boolean
}

export function PhotoGalleryManager({
  photos,
  max,
  title = 'Fotos',
  emptyHint = 'Ainda não adicionou fotos.',
  onUpload,
  uploadInputRef,
  isUploading,
  uploadMsg,
  onDelete,
  onReorder,
  wrapInCard = true,
  showHeader = true,
}: PhotoGalleryManagerProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return
    const next = photos.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder(next.map((p) => p.id))
  }

  function onDragStart(idx: number) {
    return (e: DragEvent<HTMLDivElement>) => {
      setDragIndex(idx)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(idx))
    }
  }
  function onDragOver(idx: number) {
    return (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overIndex !== idx) setOverIndex(idx)
    }
  }
  function onDrop(idx: number) {
    return (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      if (dragIndex !== null) move(dragIndex, idx)
      setDragIndex(null)
      setOverIndex(null)
    }
  }
  function onDragEnd() {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <GalleryShell wrapInCard={wrapInCard}>
      {showHeader && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {title} ({photos.length}/{max})
          </h3>
          {photos.length > 1 && (
            <p className="hidden text-xs text-gray-500 sm:block">
              Arraste para reordenar · a primeira é a capa
            </p>
          )}
        </div>
      )}

      {photos.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              className={`relative aspect-square overflow-hidden rounded-lg border bg-gray-50 transition-all ${
                dragIndex === idx
                  ? 'opacity-40'
                  : overIndex === idx
                    ? 'border-caramel-500 ring-2 ring-caramel-300'
                    : 'border-gray-200'
              }`}
            >
              <img
                src={photo.url}
                alt=""
                className="h-full w-full cursor-move object-cover"
                loading="lazy"
                draggable={false}
              />

              {idx === 0 && (
                <span className="absolute left-1 top-1 rounded-md bg-caramel-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
                  Capa
                </span>
              )}

              <div className="absolute bottom-1 left-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => move(idx, idx - 1)}
                  disabled={idx === 0}
                  className="rounded-md bg-white/90 px-1.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Mover para a esquerda"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, idx + 1)}
                  disabled={idx === photos.length - 1}
                  className="rounded-md bg-white/90 px-1.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Mover para a direita"
                >
                  →
                </button>
              </div>

              <button
                type="button"
                onClick={() => onDelete(photo.id)}
                className="absolute right-1 top-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-red-600 shadow-sm hover:bg-white"
                aria-label="Remover foto"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-sm text-gray-500">{emptyHint}</p>
      )}

      {photos.length < max && (
        <div>
          <label className="label">Adicionar fotos (máx. 2MB cada)</label>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onUpload}
            disabled={isUploading}
            className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-caramel-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-caramel-700 hover:file:bg-caramel-100"
          />
        </div>
      )}
      {uploadMsg && (
        <p
          className={`mt-2 text-sm ${
            uploadMsg.type === 'success' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {uploadMsg.text}
        </p>
      )}
    </GalleryShell>
  )
}

/**
 * Optional Card wrapper. When `wrapInCard` is false the gallery is emitted
 * as a bare fragment so the consumer can place it inside an existing card
 * with its own padding/borders.
 */
function GalleryShell({
  wrapInCard,
  children,
}: {
  wrapInCard: boolean
  children: React.ReactNode
}) {
  if (wrapInCard) return <Card hover={false}>{children}</Card>
  return <>{children}</>
}
