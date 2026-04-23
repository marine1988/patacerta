import { useState, type FormEvent } from 'react'
import { Button, Input, Modal } from '../ui'
import { StarRating } from '../shared/StarRating'

export interface ReviewFormValues {
  rating: number
  title: string
  body: string
}

interface ReviewFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (values: ReviewFormValues) => void
  initialValues?: Partial<ReviewFormValues>
  isSubmitting?: boolean
  errorMessage?: string | null
  mode?: 'create' | 'edit'
}

export function ReviewForm({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  isSubmitting,
  errorMessage,
  mode = 'create',
}: ReviewFormProps) {
  const [rating, setRating] = useState<number>(initialValues?.rating ?? 0)
  const [title, setTitle] = useState<string>(initialValues?.title ?? '')
  const [body, setBody] = useState<string>(initialValues?.body ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (rating < 1 || rating > 5) {
      setLocalError('Selecione uma classificação de 1 a 5 estrelas.')
      return
    }
    if (title.trim().length < 3) {
      setLocalError('O título deve ter pelo menos 3 caracteres.')
      return
    }
    if (body.length > 2000) {
      setLocalError('O texto da avaliação é demasiado longo (máx. 2000 caracteres).')
      return
    }
    onSubmit({ rating, title: title.trim(), body: body.trim() })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Editar avaliação' : 'Escrever avaliação'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Classificação *</label>
          <div className="mt-1">
            <StarRating
              rating={rating}
              size="lg"
              interactive
              onChange={setRating}
              label="Classificação"
            />
          </div>
        </div>

        <Input
          label="Título *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Resume a sua experiência"
          maxLength={200}
          required
        />

        <div>
          <label className="label">Comentário</label>
          <textarea
            className="input min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Descreva a sua experiência com este criador..."
            maxLength={2000}
          />
          <p className="mt-1 text-xs text-gray-400">{body.length}/2000 caracteres</p>
        </div>

        {(localError || errorMessage) && (
          <p className="text-sm text-red-600">{localError ?? errorMessage}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {mode === 'edit' ? 'Guardar alterações' : 'Publicar avaliação'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
