// ============================================
// PataCerta — Consent Banner (CMP)
// ============================================
//
// Banner fixed-bottom que aparece quando o utilizador ainda nao
// decidiu cookies para a versao actual. Tres botoes:
//  - "Aceitar todos"     -> analytics + marketing on
//  - "Rejeitar opcionais" -> so necessarios
//  - "Personalizar"      -> abre ConsentSettingsModal
//
// Persistencia e audit trail tratados em lib/consent.ts.

import { useEffect, useState } from 'react'
import { acceptAll, needsDecision, rejectOptional, subscribe } from '../../lib/consent'
import { ConsentSettingsModal } from './ConsentSettingsModal'

export function ConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setVisible(needsDecision())
    const unsub = subscribe((state) => {
      setVisible(state.decision === null)
    })
    // Permite a outros componentes (ex.: Footer) abrirem o modal
    // de definicoes via custom event, sem precisar de context provider.
    const onOpen = () => setSettingsOpen(true)
    window.addEventListener('patacerta:open-consent-settings', onOpen)
    return () => {
      unsub()
      window.removeEventListener('patacerta:open-consent-settings', onOpen)
    }
  }, [])

  if (!visible) {
    return <ConsentSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
  }

  async function handleAcceptAll() {
    setSubmitting(true)
    try {
      await acceptAll()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRejectOptional() {
    setSubmitting(true)
    try {
      await rejectOptional()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="consent-banner-title"
        aria-describedby="consent-banner-desc"
        className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line bg-surface shadow-lift"
      >
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex-1">
              <p
                id="consent-banner-title"
                className="text-[11px] uppercase tracking-caps text-subtle"
              >
                ◆ Privacidade
              </p>
              <h2 className="mt-1 font-serif text-lg text-ink">Cookies e privacidade</h2>
              <p id="consent-banner-desc" className="mt-1 text-sm leading-relaxed text-muted">
                Usamos cookies essenciais para o funcionamento do site. Com a sua autorização,
                também usamos cookies para estatísticas e publicidade personalizada.{' '}
                <a
                  href="/politica-privacidade"
                  className="underline underline-offset-2 hover:text-ink"
                >
                  Saber mais
                </a>
                .
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                disabled={submitting}
                className="btn-secondary text-sm"
              >
                Personalizar
              </button>
              <button
                type="button"
                onClick={handleRejectOptional}
                disabled={submitting}
                className="btn-secondary text-sm"
              >
                Rejeitar opcionais
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                disabled={submitting}
                className="btn-primary text-sm"
              >
                Aceitar todos
              </button>
            </div>
          </div>
        </div>
      </div>
      <ConsentSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
