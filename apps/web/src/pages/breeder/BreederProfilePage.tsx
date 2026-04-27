import { useState, lazy, Suspense } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import { useAuth } from '../../hooks/useAuth'
import { formatDate } from '../../lib/dates'
import { VerificationBadge } from '../../components/shared/VerificationBadge'
import { StarRating } from '../../components/shared/StarRating'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/EmptyState'
import { ReviewForm, type ReviewFormValues } from '../../components/reviews/ReviewForm'
import { FlagReviewModal } from '../../components/reviews/FlagReviewModal'
import { RatingHistogram } from '../../components/reviews/RatingHistogram'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import { NewThreadModal } from '../../components/messages/NewThreadModal'

const MiniMap = lazy(() =>
  import('../../components/map/MiniMap').then((m) => ({ default: m.MiniMap })),
)

interface BreederDetail {
  id: number
  businessName: string
  nif: string
  dgavNumber: string | null
  verifiedAt: string | null
  description: string | null
  website: string | null
  phone: string | null
  status: string
  userId: number
  district: { id: number; namePt: string; latitude: number | null; longitude: number | null }
  municipality: { id: number; namePt: string }
  species: { speciesId: number; species: { id: number; namePt: string } }[]
  user: { id: number; firstName: string; lastName: string; email: string }
  avgRating: number | null
  reviewCount: number
  createdAt: string
}

interface ReviewItem {
  id: number
  rating: number
  title: string
  body: string | null
  status: string
  reply: string | null
  repliedAt: string | null
  createdAt: string
  author: { id: number; firstName: string; lastName: string; avatarUrl: string | null }
  breeder: { id: number; businessName: string }
  authorId: number
}

interface ReviewsResponse {
  data: ReviewItem[]
  meta: { page: number; limit: number; total: number; totalPages: number }
  summary: {
    avgRating: number | null
    totalReviews: number
    distribution: Record<1 | 2 | 3 | 4 | 5, number>
  } | null
}

type SortOption = 'recent' | 'oldest' | 'highest' | 'lowest'

const PAGE_SIZE = 10

export function BreederProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [sort, setSort] = useState<SortOption>('recent')
  const [page, setPage] = useState(1)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [editingReview, setEditingReview] = useState<ReviewItem | null>(null)
  const [flagTarget, setFlagTarget] = useState<ReviewItem | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [threadModalOpen, setThreadModalOpen] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)

  const {
    data: breeder,
    isLoading,
    isError,
  } = useQuery<BreederDetail>({
    queryKey: ['breeder', id],
    queryFn: () => api.get(`/breeders/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const isSelf = !!user && !!breeder && breeder.userId === user.id
  const canWriteReview = !!user && user.role === 'OWNER' && !isSelf

  const reviewsQuery = useQuery<ReviewsResponse>({
    queryKey: ['reviews', { breederId: id, sort, page }],
    queryFn: () =>
      api
        .get('/reviews', {
          params: { breederId: Number(id), page, limit: PAGE_SIZE, sort },
        })
        .then((r) => r.data),
    enabled: !!id,
  })

  const reviews = reviewsQuery.data?.data ?? []
  const reviewSummary = reviewsQuery.data?.summary
  const reviewMeta = reviewsQuery.data?.meta

  const myReview = user ? reviews.find((r) => r.authorId === user.id) : undefined

  const createReviewMutation = useMutation({
    mutationFn: (values: ReviewFormValues) =>
      api.post('/reviews', { breederId: Number(id), ...values }).then((r) => r.data),
    onSuccess: () => {
      setReviewModalOpen(false)
      setEditingReview(null)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['reviews', { breederId: id }] })
      queryClient.invalidateQueries({ queryKey: ['breeder', id] })
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] })
    },
    onError: (err) => {
      setActionError(extractApiError(err, 'Erro ao publicar avaliação.'))
    },
  })

  const updateReviewMutation = useMutation({
    mutationFn: ({ reviewId, values }: { reviewId: number; values: ReviewFormValues }) =>
      api.patch(`/reviews/${reviewId}`, values).then((r) => r.data),
    onSuccess: () => {
      setReviewModalOpen(false)
      setEditingReview(null)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['reviews', { breederId: id }] })
      queryClient.invalidateQueries({ queryKey: ['breeder', id] })
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] })
    },
    onError: (err) => {
      setActionError(extractApiError(err, 'Erro ao atualizar avaliação.'))
    },
  })

  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId: number) => api.delete(`/reviews/${reviewId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', { breederId: id }] })
      queryClient.invalidateQueries({ queryKey: ['breeder', id] })
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] })
    },
  })

  const flagMutation = useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: number; reason: string }) =>
      api.post(`/reviews/${reviewId}/flag`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setFlagTarget(null)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['reviews', { breederId: id }] })
    },
    onError: (err) => {
      setActionError(extractApiError(err, 'Erro ao denunciar avaliação.'))
    },
  })

  const createThreadMutation = useMutation({
    mutationFn: (values: { subject: string; body: string }) =>
      api.post('/messages/threads', { breederId: Number(id), ...values }).then((r) => r.data),
    onSuccess: (res) => {
      setThreadModalOpen(false)
      setThreadError(null)
      navigate(`/painel?tab=mensagens&threadId=${res.threadId}`)
    },
    onError: (err) => {
      setThreadError(extractApiError(err, 'Erro ao enviar mensagem.'))
    },
  })

  function handleSendMessageClick() {
    if (!user) {
      navigate('/entrar?next=' + encodeURIComponent(`/criadores/${id}`))
      return
    }
    if (isSelf) return
    setThreadError(null)
    setThreadModalOpen(true)
  }

  function handleWriteReviewClick() {
    if (!user) {
      navigate('/entrar?next=' + encodeURIComponent(`/criadores/${id}`))
      return
    }
    setEditingReview(myReview ?? null)
    setActionError(null)
    setReviewModalOpen(true)
  }

  function handleReviewSubmit(values: ReviewFormValues) {
    if (editingReview) {
      updateReviewMutation.mutate({ reviewId: editingReview.id, values })
    } else {
      createReviewMutation.mutate(values)
    }
  }

  function handleDeleteReview(reviewId: number) {
    if (confirm('Tem a certeza que deseja eliminar a sua avaliação? Esta ação é irreversível.')) {
      deleteReviewMutation.mutate(reviewId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !breeder) {
    return (
      <div className="page-container text-center">
        <h1 className="text-2xl font-bold text-gray-900">Criador não encontrado</h1>
        <p className="mt-2 text-gray-600">O criador com ID {id} não existe ou foi removido.</p>
        <Link to="/diretorio" className="btn-primary mt-6 inline-block">
          Voltar ao diretório
        </Link>
      </div>
    )
  }

  const totalPages = reviewMeta?.totalPages ?? 1

  return (
    <div className="page-container">
      <nav className="mb-6 text-sm text-gray-500">
        <Link to="/diretorio" className="hover:text-gray-700">
          Diretório
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{breeder.businessName}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Header card */}
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar name={breeder.businessName} size="xl" />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">{breeder.businessName}</h1>
                  <VerificationBadge
                    status={breeder.status}
                    dgavNumber={breeder.dgavNumber}
                    verifiedAt={breeder.verifiedAt}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                  <span>
                    {breeder.municipality.namePt}, {breeder.district.namePt}
                  </span>
                  <span>Membro desde {formatDate(breeder.createdAt)}</span>
                  {breeder.avgRating != null && (
                    <span className="flex items-center gap-1">
                      <StarRating rating={Math.round(breeder.avgRating)} size="sm" />
                      <span className="font-semibold">{breeder.avgRating.toFixed(1)}</span>
                      <span className="text-gray-400">({breeder.reviewCount})</span>
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {breeder.species.map((s) => (
                    <Badge key={s.species.id} variant="blue">
                      {s.species.namePt}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {breeder.description && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Sobre</h2>
              <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                {breeder.description}
              </div>
            </Card>
          )}

          {breeder.status === 'VERIFIED' && breeder.dgavNumber && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Certificação</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-xs font-medium text-green-600">Registo DGAV</p>
                  <p className="mt-1 text-sm font-semibold text-green-800">{breeder.dgavNumber}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-xs font-medium text-blue-600">NIF</p>
                  <p className="mt-1 text-sm font-semibold text-blue-800">{breeder.nif}</p>
                </div>
              </div>
              {breeder.verifiedAt && (
                <p className="mt-3 text-xs text-gray-500">
                  Verificado pela equipa PataCerta em {formatDate(breeder.verifiedAt)}
                </p>
              )}
            </Card>
          )}

          {/* Reviews section */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                Avaliações
                {reviewSummary && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({reviewSummary.totalReviews})
                  </span>
                )}
              </h2>
              {canWriteReview && (
                <Button size="sm" onClick={handleWriteReviewClick}>
                  {myReview ? 'Editar avaliação' : 'Escrever avaliação'}
                </Button>
              )}
            </div>

            {reviewSummary && reviewSummary.totalReviews > 0 && (
              <div className="mt-6">
                <RatingHistogram
                  distribution={reviewSummary.distribution}
                  total={reviewSummary.totalReviews}
                  avgRating={reviewSummary.avgRating}
                />
              </div>
            )}

            {reviewSummary && reviewSummary.totalReviews > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="w-48">
                  <Select
                    label=""
                    options={[
                      { value: 'recent', label: 'Mais recentes' },
                      { value: 'oldest', label: 'Mais antigas' },
                      { value: 'highest', label: 'Melhor avaliação' },
                      { value: 'lowest', label: 'Pior avaliação' },
                    ]}
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as SortOption)
                      setPage(1)
                    }}
                  />
                </div>
              </div>
            )}

            {reviews.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  title="Sem avaliações ainda"
                  description={
                    canWriteReview
                      ? 'Seja o primeiro a avaliar este criador.'
                      : 'Este criador ainda não tem avaliações.'
                  }
                />
              </div>
            ) : (
              <div className="mt-4 divide-y divide-gray-100">
                {reviews.map((review) => {
                  const isOwn = user?.id === review.authorId
                  return (
                    <ReviewCard
                      key={review.id}
                      variant="list-item"
                      review={review}
                      ownLabel={isOwn ? 'A sua avaliação' : undefined}
                      replyLabel="Resposta do criador"
                      actions={
                        isOwn ? (
                          <>
                            <button
                              type="button"
                              onClick={handleWriteReviewClick}
                              className="text-caramel-600 hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteReview(review.id)}
                              className="text-red-600 hover:underline"
                              disabled={deleteReviewMutation.isPending}
                            >
                              Eliminar
                            </button>
                          </>
                        ) : (
                          user && (
                            <button
                              type="button"
                              onClick={() => {
                                setActionError(null)
                                setFlagTarget(review)
                              }}
                              className="text-gray-500 hover:text-red-600 hover:underline"
                            >
                              Denunciar
                            </button>
                          )
                        )
                      }
                    />
                  )
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1 || reviewsQuery.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="text-xs text-gray-500">
                  Página {page} de {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages || reviewsQuery.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Seguinte
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-base font-semibold text-gray-900">Contactar</h3>
            <div className="mt-4 space-y-3">
              <Button
                variant="primary"
                className="w-full"
                onClick={handleSendMessageClick}
                disabled={isSelf}
                title={isSelf ? 'Não pode enviar mensagem a si próprio' : undefined}
              >
                Enviar mensagem
              </Button>

              {breeder.phone && (
                <a
                  href={`tel:${breeder.phone.replace(/\s/g, '')}`}
                  className="btn-secondary flex w-full items-center justify-center gap-2"
                >
                  {breeder.phone}
                </a>
              )}

              {breeder.website && (
                <a
                  href={breeder.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex w-full items-center justify-center gap-2"
                >
                  Website
                </a>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-gray-900">Localização</h3>
            {breeder.district.latitude !== null && breeder.district.longitude !== null ? (
              <div className="mt-3">
                <Suspense
                  fallback={
                    <div className="flex h-48 items-center justify-center rounded-lg bg-gray-100">
                      <Spinner size="sm" />
                    </div>
                  }
                >
                  <MiniMap
                    latitude={breeder.district.latitude}
                    longitude={breeder.district.longitude}
                    label={`${breeder.businessName} · ${breeder.municipality.namePt}`}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="mt-3 flex h-48 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
                Sem coordenadas disponíveis
              </div>
            )}
            <p className="mt-2 text-sm text-gray-500">
              {breeder.municipality.namePt}, {breeder.district.namePt}
            </p>
          </Card>
        </div>
      </div>

      <ReviewForm
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false)
          setEditingReview(null)
        }}
        onSubmit={handleReviewSubmit}
        mode={editingReview ? 'edit' : 'create'}
        initialValues={
          editingReview
            ? {
                rating: editingReview.rating,
                title: editingReview.title,
                body: editingReview.body ?? '',
              }
            : undefined
        }
        isSubmitting={createReviewMutation.isPending || updateReviewMutation.isPending}
        errorMessage={actionError}
      />

      <FlagReviewModal
        isOpen={!!flagTarget}
        onClose={() => setFlagTarget(null)}
        onSubmit={(reason) =>
          flagTarget && flagMutation.mutate({ reviewId: flagTarget.id, reason })
        }
        isSubmitting={flagMutation.isPending}
        errorMessage={actionError}
      />

      <NewThreadModal
        isOpen={threadModalOpen}
        onClose={() => setThreadModalOpen(false)}
        onSubmit={(values) => createThreadMutation.mutate(values)}
        breederName={breeder.businessName}
        defaultSubject={`Contacto sobre ${breeder.businessName}`}
        isSubmitting={createThreadMutation.isPending}
        errorMessage={threadError}
      />
    </div>
  )
}
