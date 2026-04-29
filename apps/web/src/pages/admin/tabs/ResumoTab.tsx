import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { Card, Spinner, EmptyState } from '../../../components/ui'
import type { AdminStats } from '../_shared'

export function ResumoTab() {
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

  const cards = [
    { label: 'Utilizadores', value: stats.users.total },
    { label: 'Criadores', value: stats.breeders.total },
    { label: 'Criadores verificados', value: stats.breeders.verified },
    { label: 'Verificações pendentes', value: stats.verifications.pending },
    { label: 'Avaliações', value: stats.reviews.total },
    { label: 'Avaliações sinalizadas', value: stats.reviews.flagged },
    { label: 'Mensagens', value: stats.messages.total },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <p className="text-sm font-medium text-gray-500">{c.label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{c.value}</p>
        </Card>
      ))}
    </div>
  )
}
