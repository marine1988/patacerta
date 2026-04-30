// ============================================
// PataCerta — Consent Settings Modal (CMP)
// ============================================
//
// Modal accionado a partir do banner ("Personalizar") ou do Footer
// ("Definicoes de cookies"). Permite ligar/desligar categorias
// individualmente e ver descricao de cada uma.

import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { getConsent, saveConsent, type ConsentDecision } from '../../lib/consent'

interface ConsentSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ConsentSettingsModal({ isOpen, onClose }: ConsentSettingsModalProps) {
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Sempre que abre, recarrega o estado actual.
  useEffect(() => {
    if (!isOpen) return
    const state = getConsent()
    setAnalytics(state.decision?.analytics ?? false)
    setMarketing(state.decision?.marketing ?? false)
  }, [isOpen])

  async function handleSave() {
    setSubmitting(true)
    try {
      const decision: ConsentDecision = {
        necessary: true,
        analytics,
        marketing,
      }
      await saveConsent(decision)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Definições de cookies" size="lg">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          Escolha que tipos de cookies quer permitir. Pode mudar esta decisão a qualquer momento no
          rodapé do site.
        </p>

        <CategoryRow
          title="Estritamente necessárias"
          description="Cookies essenciais para o funcionamento do site (sessão, segurança, preferências de idioma). Não podem ser desativadas."
          checked
          locked
        />

        <CategoryRow
          title="Estatísticas"
          description="Ajudam-nos a perceber como o site é usado, de forma agregada e anónima. Não identificam o utilizador individualmente."
          checked={analytics}
          onChange={setAnalytics}
        />

        <CategoryRow
          title="Marketing e publicidade"
          description="Permitem mostrar anúncios mais relevantes através do Google AdSense. Sem o seu consentimento, mostramos apenas anúncios genéricos."
          checked={marketing}
          onChange={setMarketing}
        />

        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="btn-primary text-sm"
          >
            Guardar preferências
          </button>
        </div>
      </div>
    </Modal>
  )
}

interface CategoryRowProps {
  title: string
  description: string
  checked: boolean
  onChange?: (next: boolean) => void
  locked?: boolean
}

function CategoryRow({ title, description, checked, onChange, locked }: CategoryRowProps) {
  const id = `consent-${title.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {title}
        </label>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(e) => onChange?.(e.target.checked)}
          className="h-5 w-5 cursor-pointer rounded border-line text-caramel-700 focus:ring-2 focus:ring-caramel-500 disabled:cursor-not-allowed disabled:opacity-60"
          aria-describedby={`${id}-desc`}
        />
      </div>
    </div>
  )
}
