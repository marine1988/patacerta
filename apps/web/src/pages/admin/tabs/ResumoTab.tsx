import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { Card, Spinner, EmptyState } from '../../../components/ui'
import type { AdminStats } from '../_shared'

export function ResumoTab() {
  const navigate = useNavigate()
  const {
    data: stats,
    isLoading,
    isError,
  } = useQuery<AdminStats>({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => api.get('/admin/stats').then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !stats) {
    return (
      <EmptyState title="Erro ao carregar estatísticas" description="Tente novamente mais tarde." />
    )
  }

  // Cada KPI liga ao tab respectivo. `tab` undefined deixa o utilizador
  // no tab actual (cards sem destino logico, evitamos navegacao morta).
  const cards: Array<{ label: string; value: number; tab?: string; hint?: string }> = [
    { label: 'Utilizadores', value: stats.users.total, tab: 'utilizadores' },
    { label: 'Criadores', value: stats.breeders.total, tab: 'criadores' },
    { label: 'Criadores verificados', value: stats.breeders.verified, tab: 'criadores' },
    {
      label: 'Verificações pendentes',
      value: stats.verifications.pending,
      tab: 'verificacoes',
      hint: 'Documentos DGAV à espera de revisão',
    },
    { label: 'Avaliações', value: stats.reviews.total, tab: 'avaliacoes' },
    {
      label: 'Avaliações sinalizadas',
      value: stats.reviews.flagged,
      tab: 'avaliacoes',
      hint: 'Reviews marcadas para moderação',
    },
    { label: 'Mensagens', value: stats.messages.total },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => {
        const clickable = !!c.tab
        const handleClick = clickable ? () => navigate(`/admin?tab=${c.tab}`) : undefined
        return (
          <Card
            key={c.label}
            className={
              clickable
                ? 'cursor-pointer transition hover:border-caramel-500 hover:shadow-md focus-visible:border-caramel-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40'
                : ''
            }
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={handleClick}
            onKeyDown={
              clickable
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleClick?.()
                    }
                  }
                : undefined
            }
            aria-label={clickable ? `${c.label}: ${c.value}. Abrir separador.` : undefined}
            title={c.hint}
          >
            <p className="text-sm font-medium text-gray-500">{c.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{c.value}</p>
          </Card>
        )
      })}
    </div>
  )
}
