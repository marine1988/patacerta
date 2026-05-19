import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import { Button, EmptyState, SkeletonAvatarLine, SkeletonText } from '../../components/ui'
import { Pagination } from '../../components/ui/Pagination'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import { ReplyReviewModal } from '../../components/reviews/ReplyReviewModal'
import type { PaginatedMeta } from '../../lib/pagination'
import type { DashboardReviewItem, DashboardServiceReviewItem } from '../../lib/reviews'

type BreederReview = DashboardReviewItem & {
  breeder: { id: number; businessName: string }
}
type ServiceReview = DashboardServiceReviewItem & {
  service: { id: number; slug: string; title: string; providerId: number }
}
type UnifiedReview = (BreederReview & { kind: 'breeder' }) | (ServiceReview & { kind: 'service' })

interface ReceivedReviewsTabProps {
  /** Mostrar avaliações sobre o perfil de criador. */
  includeBreeder: boolean
  /** Mostrar avaliações sobre serviços do utilizador. */
  includeServices: boolean
}

/**
 * Tab "Avaliações sobre mim" no painel — todas as avaliações recebidas, seja
 * sobre o perfil de criador, seja sobre os serviços do utilizador. Mistura
 * ordenada por data desc. Permite responder e editar resposta no endpoint
 * correto consoante o tipo.
 */
export function ReceivedReviewsTab({ includeBreeder, includeServices }: ReceivedReviewsTabProps) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [replyTarget, setReplyTarget] = useState<UnifiedReview | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  const limit = 20

  const breederQuery = useQuery<{ data: BreederReview[]; meta: PaginatedMeta }>({
    queryKey: ['received-reviews', 'breeder', page],
    queryFn: () => api.get(`/reviews/about-me?page=${page}&limit=${limit}`).then((r) => r.data),
    enabled: includeBreeder,
  })
  const serviceQuery = useQuery<{ data: ServiceReview[]; meta: PaginatedMeta }>({
    queryKey: ['received-reviews', 'service', page],
    queryFn: () =>
      api.get(`/service-reviews/about-me?page=${page}&limit=${limit}`).then((r) => r.data),
    enabled: includeServices,
  })

  const replyBreeder = useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: number; reply: string }) =>
      api.post(`/reviews/${reviewId}/reply`, { reply }).then((r) => r.data),
    onSuccess: () => {
      setReplyTarget(null)
      setReplyError(null)
      queryClient.invalidateQueries({ queryKey: ['received-reviews'] })
    },
    onError: (err) => {
      setReplyError(extractApiError(err, 'Erro ao publicar resposta.'))
    },
  })
  const replyService = useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: number; reply: string }) =>
      api.post(`/service-reviews/${reviewId}/reply`, { reply }).then((r) => r.data),
    onSuccess: () => {
      setReplyTarget(null)
      setReplyError(null)
      queryClient.invalidateQueries({ queryKey: ['received-reviews'] })
    },
    onError: (err) => {
      setReplyError(extractApiError(err, 'Erro ao publicar resposta.'))
    },
  })

  const isLoading =
    (includeBreeder && breederQuery.isLoading) || (includeServices && serviceQuery.isLoading)

  if (isLoading) {
    return (
      <div className="space-y-4 py-4" aria-busy="true" aria-label="A carregar avaliações">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-line/60 bg-surface p-4">
            <SkeletonAvatarLine size={40} lines={2} />
            <SkeletonText lines={2} className="mt-3" />
          </div>
        ))}
      </div>
    )
  }

  // Erro só é bloqueante se ambas as fontes activas falharem.
  const breederFailed = includeBreeder && breederQuery.isError
  const serviceFailed = includeServices && serviceQuery.isError
  const allFailed =
    (includeBreeder ? breederFailed : true) && (includeServices ? serviceFailed : true)
  if (allFailed && (includeBreeder || includeServices)) {
    return (
      <EmptyState
        title="Erro ao carregar avaliações"
        description="Tente novamente daqui a alguns instantes."
      />
    )
  }

  const breederReviews: UnifiedReview[] = (
    includeBreeder ? (breederQuery.data?.data ?? []) : []
  ).map((r) => ({ ...r, kind: 'breeder' as const }))
  const serviceReviews: UnifiedReview[] = (
    includeServices ? (serviceQuery.data?.data ?? []) : []
  ).map((r) => ({ ...r, kind: 'service' as const }))
  const reviews = [...breederReviews, ...serviceReviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const totalPages = Math.max(
    includeBreeder ? (breederQuery.data?.meta.totalPages ?? 1) : 1,
    includeServices ? (serviceQuery.data?.meta.totalPages ?? 1) : 1,
  )

  if (reviews.length === 0) {
    return <EmptyState title="Sem avaliações" description="Ainda não recebeu avaliações." />
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => {
        const isService = r.kind === 'service'
        const targetName = isService ? r.service.title : r.breeder.businessName
        const contextLabel = isService ? `Serviço · ${targetName}` : `Criador · ${targetName}`
        const contextTo = isService ? `/servicos/${r.service.slug ?? r.service.id}` : undefined
        return (
          <ReviewCard
            key={`${r.kind}-${r.id}`}
            review={r}
            context={{ label: contextLabel, to: contextTo }}
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
        )
      })}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}

      <ReplyReviewModal
        isOpen={!!replyTarget}
        onClose={() => setReplyTarget(null)}
        onSubmit={(reply) => {
          if (!replyTarget) return
          if (replyTarget.kind === 'service') {
            replyService.mutate({ reviewId: replyTarget.id, reply })
          } else {
            replyBreeder.mutate({ reviewId: replyTarget.id, reply })
          }
        }}
        initialValue={replyTarget?.reply ?? ''}
        isSubmitting={replyBreeder.isPending || replyService.isPending}
        errorMessage={replyError}
      />
    </div>
  )
}
