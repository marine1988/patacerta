import { useState, useEffect, type FormEvent } from 'react'
import { Button, Modal } from '../ui'

interface ReportMessageModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
  isSubmitting?: boolean
  errorMessage?: string | null
  /** Override do titulo do modal (default = "Denunciar mensagem"). */
  title?: string
  /** Override do paragrafo introdutorio. */
  description?: string
  /** Override do placeholder do textarea. */
  placeholder?: string
}

export function ReportMessageModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
  title,
  description,
  placeholder,
}: ReportMessageModalProps) {
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setReason('')
      setLocalError(null)
    }
  }, [isOpen])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    const trimmed = reason.trim()
    if (trimmed.length < 10) {
      setLocalError('Descreva o motivo com pelo menos 10 caracteres.')
      return
    }
    if (trimmed.length > 500) {
      setLocalError('Motivo demasiado longo (máx. 500 caracteres).')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? 'Denunciar mensagem'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          {description ??
            'A sua denúncia será revista por um administrador. Indique o motivo com o máximo de detalhe possível.'}
        </p>
        <div>
          <label className="label">Motivo *</label>
          <textarea
            className="input min-h-[120px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder ?? 'Ex.: Conteúdo ofensivo, spam, fraude, etc.'}
            maxLength={500}
            required
          />
          <p className="mt-1 text-xs text-gray-400">{reason.length}/500 caracteres</p>
        </div>

        {(localError || errorMessage) && (
          <p className="text-sm text-red-600">{localError ?? errorMessage}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={isSubmitting}>
            Enviar denúncia
          </Button>
        </div>
      </form>
    </Modal>
  )
}
