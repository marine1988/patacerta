import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import { Button, EmptyState, Spinner } from '../../components/ui'
import { Pagination } from '../../components/ui/Pagination'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import { ReplyReviewModal } from '../../components/reviews/ReplyReviewModal'
import type { PaginatedMeta } from '../../lib/pagination'
import type { DashboardReviewItem } from '../../lib/reviews'

type ReviewItem = DashboardReviewItem & {
  breeder: { id: number; businessName: string }
}

/**
 * Tab "Avaliacoes sobre mim" no painel do criador.
 *
 * Lista todas as avaliacoes recebidas no perfil de criador. Permite
 * responder e editar a resposta — sem outras accoes (denuncia/eliminacao
 * sao nas paginas publicas / admin).
 */
export function ReviewsAboutMeTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [replyTarget, setReplyTarget] = useState<ReviewItem | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ data: ReviewItem[]; meta: PaginatedMeta }>({
    queryKey: ['reviews-about-me', page],
    queryFn: () => api.get(`/reviews/about-me?page=${page}&limit=20`).then((r) => r.data),
  })

  const replyMutation = useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: number; reply: string }) =>
      api.post(`/reviews/${reviewId}/reply`, { reply }).then((r) => r.data),
    onSuccess: () => {
      setReplyTarget(null)
      setReplyError(null)
      queryClient.invalidateQueries({ queryKey: ['reviews-about-me'] })
    },
    onError: (err) => {
      setReplyError(extractApiError(err, 'Erro ao publicar resposta.'))
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
    return <EmptyState title="Sem avaliações" description="Ainda não recebeu avaliações." />
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          showStatusBadge
          replyLabel="A sua resposta"
          onReplyEdit={
            r.reply
              ? () => {
                  setReplyError(null)
                  setReplyTarget(r)
                }
              : undefined
          }
          actions={
            !r.reply && r.status === 'PUBLISHED' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setReplyError(null)
                  setReplyTarget(r)
                }}
              >
                Responder
              </Button>
            ) : null
          }
        />
      ))}

      {data && <Pagination page={page} totalPages={data.meta.totalPages} onChange={setPage} />}

      <ReplyReviewModal
        isOpen={!!replyTarget}
        onClose={() => setReplyTarget(null)}
        onSubmit={(reply) =>
          replyTarget && replyMutation.mutate({ reviewId: replyTarget.id, reply })
        }
        initialValue={replyTarget?.reply ?? ''}
        isSubmitting={replyMutation.isPending}
        errorMessage={replyError}
      />
    </div>
  )
}
