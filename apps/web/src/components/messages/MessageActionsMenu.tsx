import { useState, useRef, useEffect } from 'react'

interface MessageActionsMenuProps {
  canEdit: boolean
  canDelete: boolean
  canReport: boolean
  onEdit?: () => void
  onDelete?: () => void
  onReport?: () => void
  variant?: 'own' | 'other'
}

/**
 * Kebab (⋮) popover menu with edit/delete/report actions for a single message.
 * Visibility of each action is controlled by the `can*` props computed by the
 * caller (typically: author within 15-min window → edit/delete; non-author → report).
 */
export function MessageActionsMenu({
  canEdit,
  canDelete,
  canReport,
  onEdit,
  onDelete,
  onReport,
  variant = 'other',
}: MessageActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!canEdit && !canDelete && !canReport) return null

  const btnColor =
    variant === 'own'
      ? 'text-primary-100 hover:text-white hover:bg-white/10'
      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Ações da mensagem"
        onClick={() => setOpen((v) => !v)}
        className={`rounded p-1 transition-colors ${btnColor}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          {canEdit && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setOpen(false)
                onEdit?.()
              }}
            >
              Editar
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                setOpen(false)
                onDelete?.()
              }}
            >
              Eliminar
            </button>
          )}
          {canReport && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setOpen(false)
                onReport?.()
              }}
            >
              Denunciar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
