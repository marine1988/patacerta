import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button, EmptyState, Spinner } from '../../components/ui'
import { Pagination } from '../../components/ui/Pagination'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import type { PaginatedMeta } from '../../lib/pagination'
import type { DashboardReviewItem } from '../../lib/reviews'

type ReviewItem = DashboardReviewItem & {
  breeder: { id: number; businessName: string }
}

/**
 * Tab "Minhas avaliacoes" no painel — avaliacoes que o utilizador escreveu.
 *
 * Mostra estado de moderacao + motivo (quando HIDDEN) e resposta do criador
 * read-only. Permite eliminar a avaliacao.
 */
export function MyReviewsTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<{ data: ReviewItem[]; meta: PaginatedMeta }>({
    queryKey: ['my-reviews', page],
    queryFn: () => api.get(`/reviews/mine?page=${page}&limit=20`).then((r) => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (reviewId: number) => api.delete(`/reviews/${reviewId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  const reviews = data?.data ?? []

  if (reviews.length === 0) {
    return (
      <EmptyState
        title="Ainda não avaliou ninguém"
        description="Avalie os criadores com quem teve contacto para ajudar a comunidade."
      />
    )
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          context={{ label: r.breeder.businessName }}
          showAuthor={false}
          showStatusBadge
          showModerationReason
          replyLabel="Resposta do criador"
          actions={
            <Button
              variant="danger"
              size="sm"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (confirm('Eliminar esta avaliação?')) deleteMutation.mutate(r.id)
              }}
            >
              Eliminar
            </Button>
          }
        />
      ))}

      {data && <Pagination page={page} totalPages={data.meta.totalPages} onChange={setPage} />}
    </div>
  )
}
