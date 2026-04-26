import { useState, type FormEvent, useEffect } from 'react'
import { Button, Input, Modal } from '../ui'

interface NewThreadModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (values: { subject: string; body: string }) => void
  breederName?: string
  isSubmitting?: boolean
  errorMessage?: string | null
  defaultSubject?: string
  /** Override do placeholder do assunto. Default = exemplo de criadores. */
  subjectPlaceholder?: string
  /** Override do placeholder do corpo. Default = "Escreva a sua mensagem...". */
  bodyPlaceholder?: string
  /** Override do titulo do modal (default deriva de `breederName`). */
  title?: string
}

export function NewThreadModal({
  isOpen,
  onClose,
  onSubmit,
  breederName,
  isSubmitting,
  errorMessage,
  defaultSubject,
  subjectPlaceholder,
  bodyPlaceholder,
  title,
}: NewThreadModalProps) {
  const [subject, setSubject] = useState(defaultSubject ?? '')
  const [body, setBody] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSubject(defaultSubject ?? '')
      setBody('')
      setLocalError(null)
    }
  }, [isOpen, defaultSubject])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (subject.trim().length < 1) {
      setLocalError('Indique um assunto.')
      return
    }
    if (body.trim().length < 1) {
      setLocalError('Escreva uma mensagem.')
      return
    }
    if (body.length > 5000) {
      setLocalError('Mensagem demasiado longa (máx. 5000 caracteres).')
      return
    }
    onSubmit({ subject: subject.trim(), body: body.trim() })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? (breederName ? `Contactar ${breederName}` : 'Nova conversa')}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Assunto *"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={subjectPlaceholder ?? 'Ex.: Disponibilidade de cachorros'}
          maxLength={200}
          required
        />

        <div>
          <label className="label">Mensagem *</label>
          <textarea
            className="input min-h-[140px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={bodyPlaceholder ?? 'Escreva a sua mensagem...'}
            maxLength={5000}
            required
          />
          <p className="mt-1 text-xs text-gray-400">{body.length}/5000 caracteres</p>
        </div>

        {(localError || errorMessage) && (
          <p className="text-sm text-red-600">{localError ?? errorMessage}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Enviar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
