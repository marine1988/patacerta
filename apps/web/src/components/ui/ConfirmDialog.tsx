import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Estilo do botao de confirmacao; "danger" para accoes destrutivas. */
  variant?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
  /** Quando true, mostra spinner e desactiva botoes (mutation in-flight). */
  isPending?: boolean
}

/**
 * Dialogo de confirmacao acessivel para substituir `window.confirm()`.
 *
 * Vantagens face ao confirm nativo:
 * - acessivel (focus trap, ESC, role=dialog via Modal)
 * - estilo consistente com o resto da app
 * - suporta mensagens ricas (ReactNode) e estado "pending"
 * - permite acessao destrutiva com variante visual (vermelho)
 *
 * Para uso imperativo (substituicao 1:1 de confirm()), ver useConfirm().
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
  isPending = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={isPending ? () => {} : onCancel} title={title} size="sm">
      <div className="space-y-5">
        <div className="text-sm leading-relaxed text-gray-700">{message}</div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={
              variant === 'danger'
                ? 'inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
                : 'btn-primary'
            }
          >
            {isPending ? 'A processar…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
}

interface PendingConfirm extends Required<Omit<ConfirmOptions, 'title'>> {
  title: string
  resolve: (value: boolean) => void
}

/**
 * Hook imperativo para substituir `window.confirm()` por um dialogo acessivel.
 *
 * Devolve `[confirm, dialog]`:
 * - `confirm(options)` -> Promise<boolean>
 * - `dialog` -> elemento JSX a renderizar uma vez no componente
 *
 * Exemplo:
 *   const [confirm, confirmDialog] = useConfirm()
 *   const onDelete = async () => {
 *     if (await confirm({ message: 'Eliminar?', variant: 'danger' })) {
 *       deleteMutation.mutate(id)
 *     }
 *   }
 *   return <>{...}{confirmDialog}</>
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  // Guarda o resolve fora do state para garantir uma unica chamada por dialogo.
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // Se ja existir um dialogo pendente, resolver com false antes de abrir o novo.
      if (resolveRef.current) {
        resolveRef.current(false)
        resolveRef.current = null
      }
      resolveRef.current = resolve
      setPending({
        title: options.title ?? 'Confirmar',
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirmar',
        cancelLabel: options.cancelLabel ?? 'Cancelar',
        variant: options.variant ?? 'primary',
        resolve,
      })
    })
  }, [])

  const handle = useCallback((value: boolean) => {
    if (resolveRef.current) {
      resolveRef.current(value)
      resolveRef.current = null
    }
    setPending(null)
  }, [])

  // Defensivo: ao desmontar, resolver com false para evitar promessas penduradas.
  useEffect(() => {
    return () => {
      if (resolveRef.current) {
        resolveRef.current(false)
        resolveRef.current = null
      }
    }
  }, [])

  const dialog = (
    <ConfirmDialog
      isOpen={pending !== null}
      title={pending?.title ?? ''}
      message={pending?.message ?? ''}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      variant={pending?.variant}
      onConfirm={() => handle(true)}
      onCancel={() => handle(false)}
    />
  )

  return [confirm, dialog]
}
