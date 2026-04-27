import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/dates'
import { Card, Avatar, Badge, Button, EmptyState, Spinner } from '../../components/ui'
import { StarRating } from '../../components/shared/StarRating'
import { ReplyReviewModal } from '../../components/reviews/ReplyReviewModal'

// Tipos locais — espelham a resposta de GET /service-reviews/about-me

interface ServiceReviewItem {
  id: number
  serviceId: number
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
  service: { id: number; title: string; providerId: number }
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
 * Tab "Avaliacoes de servicos" no painel.
 *
 * Lista todas as avaliacoes recebidas em qualquer servico do utilizador
 * (filtra por service.providerId no backend). Permite responder/editar
 * resposta — espelha a tab "Avaliacoes sobre mim" do criador.
 */
export function ServiceReviewsTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [replyTarget, setReplyTarget] = useState<ServiceReviewItem | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ data: ServiceReviewItem[]; meta: PaginatedMeta }>({
    queryKey: ['service-reviews-about-me', page],
    queryFn: () => api.get(`/service-reviews/about-me?page=${page}&limit=20`).then((r) => r.data),
  })

  const replyMutation = useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: number; reply: string }) =>
      api.post(`/service-reviews/${reviewId}/reply`, { reply }).then((r) => r.data),
    onSuccess: () => {
      setReplyTarget(null)
      setReplyError(null)
      queryClient.invalidateQueries({ queryKey: ['service-reviews-about-me'] })
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
    return (
      <EmptyState
        title="Sem avaliações"
        description="Ainda não recebeu avaliações nos seus serviços."
      />
    )
  }

  const statusVariant: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
    PUBLISHED: 'green',
    FLAGGED: 'yellow',
    HIDDEN: 'red',
  }
  const statusLabel: Record<string, string> = {
    PUBLISHED: 'Publicada',
    FLAGGED: 'Em revisão',
    HIDDEN: 'Oculta',
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <Card key={r.id} hover={false}>
          <div className="flex items-start gap-3">
            <Avatar
              name={`${r.author.firstName} ${r.author.lastName}`}
              imageUrl={r.author.avatarUrl ?? undefined}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {r.author.firstName} {r.author.lastName}
                </span>
                <StarRating rating={r.rating} />
                <Badge variant={statusVariant[r.status] ?? 'gray'}>
                  {statusLabel[r.status] ?? r.status}
                </Badge>
              </div>
              <h4 className="mt-1 text-sm font-semibold text-gray-900">{r.title}</h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Sobre:{' '}
                <Link to={`/servicos/${r.service.id}`} className="text-caramel-600 hover:underline">
                  {r.service.title}
                </Link>
              </p>
              {r.body && <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{r.body}</p>}
              <p className="mt-1 text-xs text-gray-400">{formatDate(r.createdAt)}</p>

              {r.reply ? (
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-500">
                      A sua resposta
                      {r.repliedAt && ` · ${formatDate(r.repliedAt)}`}
                    </p>
                    {r.status === 'PUBLISHED' && (
                      <button
                        type="button"
                        className="text-xs text-caramel-600 hover:underline"
                        onClick={() => {
                          setReplyError(null)
                          setReplyTarget(r)
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{r.reply}</p>
                </div>
              ) : (
                r.status === 'PUBLISHED' && (
                  <div className="mt-2">
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
                  </div>
                )
              )}
            </div>
          </div>
        </Card>
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
