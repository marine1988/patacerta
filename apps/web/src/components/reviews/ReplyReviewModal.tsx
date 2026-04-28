import { useState, type FormEvent } from 'react'
import { Button, Modal } from '../ui'

interface ReplyReviewModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reply: string) => void
  initialValue?: string
  isSubmitting?: boolean
  errorMessage?: string | null
}

export function ReplyReviewModal({
  isOpen,
  onClose,
  onSubmit,
  initialValue = '',
  isSubmitting,
  errorMessage,
}: ReplyReviewModalProps) {
  const [reply, setReply] = useState(initialValue)
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    const trimmed = reply.trim()
    if (trimmed.length < 20) {
      setLocalError('Resposta demasiado curta — escreva pelo menos 20 caracteres.')
      return
    }
    if (trimmed.length > 2000) {
      setLocalError('Resposta demasiado longa (máx. 2000 caracteres).')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialValue ? 'Editar resposta' : 'Responder à avaliação'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">A sua resposta *</label>
          <textarea
            className="input min-h-[120px]"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Responda de forma cordial e profissional (mínimo 20 caracteres)…"
            maxLength={2000}
            required
          />
          <p
            className={`mt-1 text-xs ${
              reply.trim().length === 0
                ? 'text-gray-400'
                : reply.trim().length < 20
                  ? 'text-amber-600'
                  : 'text-gray-400'
            }`}
          >
            {reply.trim().length < 20 ? `${reply.length}/2000 (mín. 20)` : `${reply.length}/2000`}
          </p>
        </div>

        {(localError || errorMessage) && (
          <p className="text-sm text-red-600">{localError ?? errorMessage}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {initialValue ? 'Guardar' : 'Publicar resposta'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
