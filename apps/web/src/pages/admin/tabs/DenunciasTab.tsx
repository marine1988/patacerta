import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { MensagensReportsView } from './moderacao/MensagensReports'
import { ServicosReportsView } from './moderacao/ServicosReports'
import { AvaliacoesReportsView } from './moderacao/AvaliacoesReports'

/**
 * DenunciasTab — shell de moderacao com sub-tabs para Mensagens,
 * Servicos e Avaliacoes sinalizadas. Substitui a antiga DenunciasTab
 * (que so cobria mensagens), a sub-tab "Denuncias" da ServicosTab e a
 * tab top-level Avaliacoes.
 *
 * O sub-tab activo persiste em `?sub=mensagens|servicos|avaliacoes`
 * para deep-linking. Default: mensagens.
 *
 * Os contadores de PENDING vem de /admin/pending-counts (refetch
 * automatico apos qualquer mutation por queryClient.invalidateQueries).
 */

interface PendingCounts {
  pendingMessageReports: number
  pendingServiceReports: number
  flaggedReviews: number
}

type SubTab = 'mensagens' | 'servicos' | 'avaliacoes'

const SUB_TABS: Array<{ id: SubTab; label: string; countKey: keyof PendingCounts }> = [
  { id: 'mensagens', label: 'Mensagens', countKey: 'pendingMessageReports' },
  { id: 'servicos', label: 'Serviços', countKey: 'pendingServiceReports' },
  { id: 'avaliacoes', label: 'Avaliações', countKey: 'flaggedReviews' },
]

function isSubTab(v: string | null): v is SubTab {
  return v === 'mensagens' || v === 'servicos' || v === 'avaliacoes'
}

export function DenunciasTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const subParam = searchParams.get('sub')
  const [active, setActive] = useState<SubTab>(isSubTab(subParam) ? subParam : 'mensagens')

  // Sincroniza sub-tab <-> ?sub=. Permite deep-linking interno.
  useEffect(() => {
    if (isSubTab(subParam) && subParam !== active) setActive(subParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subParam])

  function changeSub(id: SubTab) {
    setActive(id)
    const next = new URLSearchParams(searchParams)
    if (id === 'mensagens') next.delete('sub')
    else next.set('sub', id)
    setSearchParams(next, { replace: true })
  }

  // Contadores por sub-tab. Failure-tolerant: se /pending-counts falhar,
  // simplesmente nao mostramos badges (nao bloqueia a UI).
  const { data: counts } = useQuery<PendingCounts>({
    queryKey: queryKeys.admin.pendingCounts(),
    queryFn: () => api.get('/admin/pending-counts').then((r) => r.data),
    staleTime: 30_000,
  })

  return (
    <div>
      {/* Segmented control de sub-tabs */}
      <div
        className="mb-6 flex flex-wrap items-center gap-1 border-b border-line"
        role="tablist"
        aria-label="Tipo de denúncia"
      >
        {SUB_TABS.map((t) => {
          const isActive = active === t.id
          const count = counts?.[t.countKey] ?? 0
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => changeSub(t.id)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-[11px] font-medium uppercase tracking-caps transition-colors ${
                isActive
                  ? 'border-caramel-500 text-caramel-700'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive
                      ? 'bg-caramel-500 text-white'
                      : 'bg-red-100 text-red-700'
                  }`}
                  aria-label={`${count} pendentes`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {active === 'mensagens' && <MensagensReportsView />}
      {active === 'servicos' && <ServicosReportsView />}
      {active === 'avaliacoes' && <AvaliacoesReportsView />}
    </div>
  )
}
