import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button, EmptyState, Spinner } from '../../components/ui'
import { Pagination } from '../../components/ui/Pagination'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import type { PaginatedMeta } from '../../lib/pagination'
import type { DashboardReviewItem, DashboardServiceReviewItem } from '../../lib/reviews'

type BreederReview = DashboardReviewItem & {
  breeder: { id: number; businessName: string }
}

type ServiceReview = DashboardServiceReviewItem & {
  service: { id: number; title: string; providerId: number }
}

// União anotada com kind, para o render saber a que tipo chamar.
type UnifiedReview = (BreederReview & { kind: 'breeder' }) | (ServiceReview & { kind: 'service' })

/**
 * Tab "Minhas avaliações" no painel — todas as avaliações que o utilizador
 * escreveu, sobre criadores E sobre serviços, intercaladas por data
 * descendente. Permite eliminar (chama o endpoint correto consoante o tipo).
 */
export function MyReviewsTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const limit = 20

  // Dois pedidos paralelos. Ambos usam a mesma `page` para simplificar; com
  // volumes baixos isto não é problema. Se um dia for crítico, substituímos
  // por endpoint unificado paginado no backend.
  const breederQuery = useQuery<{ data: BreederReview[]; meta: PaginatedMeta }>({
    queryKey: ['my-reviews', 'breeder', page],
    queryFn: () => api.get(`/reviews/mine?page=${page}&limit=${limit}`).then((r) => r.data),
  })
  const serviceQuery = useQuery<{ data: ServiceReview[]; meta: PaginatedMeta }>({
    queryKey: ['my-reviews', 'service', page],
    queryFn: () => api.get(`/service-reviews/mine?page=${page}&limit=${limit}`).then((r) => r.data),
  })

  const deleteBreederReview = useMutation({
    mutationFn: (reviewId: number) => api.delete(`/reviews/${reviewId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] })
    },
  })
  const deleteServiceReview = useMutation({
    mutationFn: (reviewId: number) => api.delete(`/service-reviews/${reviewId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] })
    },
  })

  if (breederQuery.isLoading || serviceQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  const breederReviews: UnifiedReview[] = (breederQuery.data?.data ?? []).map((r) => ({
    ...r,
    kind: 'breeder' as const,
  }))
  const serviceReviews: UnifiedReview[] = (serviceQuery.data?.data ?? []).map((r) => ({
    ...r,
    kind: 'service' as const,
  }))
  const reviews = [...breederReviews, ...serviceReviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  // Total combinado para paginação aproximada — mostramos a maior contagem
  // de páginas das duas para não cortar resultados de uma fonte.
  const totalPages = Math.max(
    breederQuery.data?.meta.totalPages ?? 1,
    serviceQuery.data?.meta.totalPages ?? 1,
  )

  if (reviews.length === 0) {
    return (
      <EmptyState
        title="Ainda não escreveu avaliações"
        description="Avalie criadores e serviços com quem teve contacto para ajudar a comunidade."
      />
    )
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => {
        const isService = r.kind === 'service'
        const targetName = isService ? r.service.title : r.breeder.businessName
        const contextLabel = isService ? `Serviço · ${targetName}` : `Criador · ${targetName}`
        const contextTo = isService ? `/servicos/${r.service.id}` : undefined
        return (
          <ReviewCard
            key={`${r.kind}-${r.id}`}
            review={r}
            context={{ label: contextLabel, to: contextTo }}
            showAuthor={false}
            showStatusBadge
            showModerationReason
            replyLabel={isService ? 'Resposta do prestador' : 'Resposta do criador'}
            actions={
              <Button
                variant="danger"
                size="sm"
                loading={isService ? deleteServiceReview.isPending : deleteBreederReview.isPending}
                onClick={() => {
                  if (!confirm('Eliminar esta avaliação?')) return
                  if (isService) deleteServiceReview.mutate(r.id)
                  else deleteBreederReview.mutate(r.id)
                }}
              >
                Eliminar
              </Button>
            }
          />
        )
      })}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
    </div>
  )
}
