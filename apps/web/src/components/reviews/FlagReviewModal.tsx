import { useState, type FormEvent } from 'react'
import { Button, Modal, Select } from '../ui'

const FLAG_REASONS = [
  { value: '', label: 'Selecionar motivo...' },
  { value: 'SPAM', label: 'Spam ou publicidade' },
  { value: 'OFFENSIVE', label: 'Linguagem ofensiva ou discurso de ódio' },
  { value: 'FAKE', label: 'Informação falsa ou enganosa' },
  { value: 'PRIVACY', label: 'Viola privacidade de terceiros' },
  { value: 'OFF_TOPIC', label: 'Não relacionada com o criador' },
  { value: 'OTHER', label: 'Outro' },
]

interface FlagReviewModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
  isSubmitting?: boolean
  errorMessage?: string | null
}

export function FlagReviewModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
}: FlagReviewModalProps) {
  const [category, setCategory] = useState('')
  const [details, setDetails] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!category) {
      setLocalError('Selecione um motivo.')
      return
    }
    const trimmedDetails = details.trim()
    if (trimmedDetails.length < 20) {
      setLocalError('Descreva o motivo com mais detalhe (mínimo 20 caracteres).')
      return
    }
    const combined = `[${category}] ${trimmedDetails}`
    onSubmit(combined)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Denunciar avaliação" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Ajude-nos a manter a qualidade da plataforma. A sua denúncia será revista por um
          administrador. Denúncias falsas ou abusivas podem levar a suspensão.
        </p>

        <Select
          label="Motivo *"
          options={FLAG_REASONS}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />

        <div>
          <label className="label">Detalhes adicionais</label>
          <textarea
            className="input min-h-[100px]"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Explique brevemente o motivo da denúncia..."
            maxLength={400}
          />
          <p className="mt-1 text-xs text-gray-400">{details.length}/400 caracteres</p>
        </div>

        {(localError || errorMessage) && (
          <p className="text-sm text-red-600">{localError ?? errorMessage}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" loading={isSubmitting}>
            Denunciar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
