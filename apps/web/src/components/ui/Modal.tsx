import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

/**
 * Selector dos elementos focaveis dentro do dialogo. Cobre os casos comuns
 * e exclui explicitamente elementos `disabled` ou `tabindex=-1`. Inputs
 * hidden tambem nao entram porque `input[type=hidden]` nao casa em `input`
 * sem tipo (cobertura defensiva: filtramos por `offsetParent`).
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('inert') && el.offsetParent !== null,
  )
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Origem do foco antes de abrir, para devolver foco ao fechar (a11y).
  const previouslyFocused = useRef<HTMLElement | null>(null)
  // ID unico para `aria-labelledby` (suporta multiplos modais simultaneos).
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: ciclar Tab entre o primeiro e o ultimo elemento focavel.
      // Sem isto, Tab podia saltar para fora do dialogo (browser chrome,
      // pagina por baixo) e o utilizador de teclado perdia o contexto.
      const focusables = getFocusable(dialogRef.current)
      if (focusables.length === 0) {
        e.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Foco inicial: primeiro elemento focavel; se nao houver, o proprio
    // container (tabindex=-1) para que Tab funcione e Escape ainda feche.
    const focusables = getFocusable(dialogRef.current)
    if (focusables.length > 0) {
      focusables[0].focus()
    } else {
      dialogRef.current?.focus()
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      // Restaurar foco ao elemento que abriu o modal (a11y / SR users).
      const target = previouslyFocused.current
      if (target && typeof target.focus === 'function') {
        // setTimeout para garantir que o modal ja saiu do DOM e nao
        // intercepta o foco.
        setTimeout(() => target.focus(), 0)
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={`${sizeClasses[size]} w-full rounded-xl bg-white shadow-xl outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button onClick={onClose} className="btn-icon" aria-label="Fechar">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}
