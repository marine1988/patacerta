import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button, EmptyState, Spinner } from '../../components/ui'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import type { PaginatedMeta } from '../../lib/pagination'

interface ReviewItem {
  id: number
  breederId: number
  authorId: number
  rating: number
  title: string
  body: string | null
  status: string
  moderationReason: string | null
  reply: string | null
  repliedAt: string | null
  createdAt: string
  updatedAt: string
  author: { id: number; firstName: string; lastName: string; avatarUrl: string | null }
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

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs text-gray-500">
            {page} / {data.meta.totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Seguinte
          </Button>
        </div>
      )}
    </div>
  )
}
