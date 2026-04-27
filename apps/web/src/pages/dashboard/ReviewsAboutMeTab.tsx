import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '../../lib/api'
import { Button, EmptyState, Spinner } from '../../components/ui'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import { ReplyReviewModal } from '../../components/reviews/ReplyReviewModal'

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

interface PaginatedMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

function getExtractedError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined
    return data?.error ?? data?.message ?? err.message ?? fallback
  }
  return fallback
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
      setReplyError(getExtractedError(err, 'Erro ao publicar resposta.'))
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
