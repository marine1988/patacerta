import { useState, lazy, Suspense } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import type { PaginatedMeta } from '../../lib/pagination'
import type { ReviewItem as ReviewItemBase } from '../../lib/reviews'

type ReviewItem = ReviewItemBase & {
  breeder: { id: number; businessName: string }
}
import { useAuth } from '../../hooks/useAuth'
import { formatDate } from '../../lib/dates'
import { VerificationBadge } from '../../components/shared/VerificationBadge'
import { StarRating } from '../../components/shared/StarRating'
import { YouTubeEmbed } from '../../components/shared/YouTubeEmbed'
import { PhotoLightbox } from '../../components/shared/PhotoLightbox'
import { Avatar } from '../../components/ui/Avatar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { ReviewForm, type ReviewFormValues } from '../../components/reviews/ReviewForm'
import { FlagReviewModal } from '../../components/reviews/FlagReviewModal'
import { RatingHistogram } from '../../components/reviews/RatingHistogram'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import { NewThreadModal } from '../../components/messages/NewThreadModal'
import { AdContainer, AD_SLOTS } from '../../components/ads'

const MiniMap = lazy(() =>
  import('../../components/map/MiniMap').then((m) => ({ default: m.MiniMap })),
)

interface BreederPhoto {
  id: number
  url: string
  caption: string | null
  sortOrder: number
}

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
  user: { id: number; firstName: string; lastName: string; email: string }
  avgRating: number | null
  reviewCount: number
  createdAt: string
  photos?: BreederPhoto[]
  youtubeVideoId?: string | null
  cpcMember?: boolean
  fciAffiliated?: boolean
  vetCheckup?: boolean
  microchip?: boolean
  vaccinations?: boolean
  lopRegistry?: boolean
  kennelName?: boolean
  salesInvoice?: boolean
  food?: boolean
  initialTraining?: boolean
  pickupInPerson?: boolean
  deliveryByCar?: boolean
  deliveryByPlane?: boolean
  pickupNotes?: string | null
  breeds?: Array<{
    breed: { id: number; nameSlug: string; namePt: string; fciGroup: string | null }
  }>
  otherBreedsNote?: string | null
}

interface ReviewsResponse {
  data: ReviewItem[]
  meta: PaginatedMeta
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

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

  const eligibilityQuery = useQuery<{
    eligible: boolean
    reason: string | null
    detail: {
      threadFound: boolean
      sentByAuthor: number
      sentByCounterparty: number
      windowDays: number
      minPerSide: number
    }
  }>({
    queryKey: ['review-eligibility', { breederId: id }],
    queryFn: () =>
      api.get('/reviews/eligibility', { params: { breederId: Number(id) } }).then((r) => r.data),
    enabled: !!id && canWriteReview,
    staleTime: 30_000,
  })

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
      navigate(`/area-pessoal?tab=mensagens&threadId=${res.threadId}`)
    },
    onError: (err) => {
      setThreadError(extractApiError(err, 'Erro ao enviar mensagem.'))
    },
  })

  function handleSendMessageClick() {
    if (!user) {
      navigate('/entrar?next=' + encodeURIComponent(`/criador/${id}`))
      return
    }
    if (isSelf) return
    setThreadError(null)
    setThreadModalOpen(true)
  }

  function handleWriteReviewClick() {
    if (!user) {
      navigate('/entrar?next=' + encodeURIComponent(`/criador/${id}`))
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
        <Link to="/pesquisar" className="btn-primary mt-6 inline-block">
          Voltar ao diretório
        </Link>
      </div>
    )
  }

  const totalPages = reviewMeta?.totalPages ?? 1

  return (
    <div className="page-container">
      <nav className="mb-6 text-sm text-gray-500">
        <Link to="/pesquisar" className="hover:text-gray-700">
          Criadores
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
              </div>
            </div>
          </Card>

          {/* Galeria */}
          {breeder.photos && breeder.photos.length > 0 && (
            <Card>
              {/* Hero: foto de capa grande + miniaturas */}
              <button
                type="button"
                onClick={() => setLightboxIndex(0)}
                className="block w-full overflow-hidden rounded-lg"
                aria-label="Abrir galeria"
              >
                <div className="aspect-[16/9] w-full bg-gray-100">
                  <img
                    src={breeder.photos[0].url}
                    alt={`${breeder.businessName} — foto principal`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </button>
              {breeder.photos.length > 1 && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {breeder.photos.slice(1, 7).map((photo, idx) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setLightboxIndex(idx + 1)}
                      className="relative aspect-square overflow-hidden rounded-md bg-gray-100"
                      aria-label={`Abrir foto ${idx + 2}`}
                    >
                      <img
                        src={photo.url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      {idx === 5 && breeder.photos!.length > 7 && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                          +{breeder.photos!.length - 7}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {breeder.description && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">
                Conheça {breeder.businessName}
              </h2>
              <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                {breeder.description}
              </div>
            </Card>
          )}

          {/* Racas */}
          {((breeder.breeds && breeder.breeds.length > 0) || breeder.otherBreedsNote) && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Raças que cria</h2>
              {breeder.breeds && breeder.breeds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {breeder.breeds.map((b) => (
                    <span
                      key={b.breed.id}
                      className="inline-flex items-center rounded-full border border-caramel-200 bg-caramel-50 px-3 py-1 text-sm text-caramel-700"
                    >
                      {b.breed.namePt}
                    </span>
                  ))}
                </div>
              )}
              {breeder.otherBreedsNote && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Outras raças
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
                    {breeder.otherBreedsNote}
                  </p>
                </div>
              )}
            </Card>
          )}

          {breeder.youtubeVideoId && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Vídeo de apresentação</h2>
              <div className="mt-3">
                <YouTubeEmbed videoId={breeder.youtubeVideoId} title={breeder.businessName} />
              </div>
            </Card>
          )}

          {/* Reconhecimentos oficiais */}
          {(breeder.cpcMember || breeder.fciAffiliated) && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Reconhecimentos oficiais</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {breeder.cpcMember && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Membro CPC
                    </p>
                    <p className="mt-1 text-sm text-blue-900">Clube Português de Canicultura</p>
                  </div>
                )}
                {breeder.fciAffiliated && (
                  <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                      Filiado FCI
                    </p>
                    <p className="mt-1 text-sm text-purple-900">
                      Fédération Cynologique Internationale
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* O que está incluído */}
          {(() => {
            const items = [
              { key: 'vetCheckup', label: 'Check-up veterinário', icon: '🩺', col: 'health' },
              { key: 'microchip', label: 'Microchip implantado', icon: '🔬', col: 'health' },
              { key: 'vaccinations', label: 'Vacinação em dia', icon: '💉', col: 'health' },
              { key: 'lopRegistry', label: 'Registo no LOP', icon: '📜', col: 'docs' },
              { key: 'kennelName', label: 'Nome de canil', icon: '🏷️', col: 'docs' },
              { key: 'salesInvoice', label: 'Factura de venda', icon: '🧾', col: 'docs' },
              { key: 'food', label: 'Alimentação inicial', icon: '🥣', col: 'extras' },
              { key: 'initialTraining', label: 'Treino inicial', icon: '🐾', col: 'extras' },
            ] as const
            const active = items.filter((it) => breeder[it.key])
            if (active.length === 0) return null
            const groups: Record<string, { title: string; rows: typeof active }> = {
              health: { title: 'Saúde', rows: [] },
              docs: { title: 'Documentação', rows: [] },
              extras: { title: 'Extras', rows: [] },
            }
            for (const it of active) groups[it.col].rows.push(it)
            return (
              <Card>
                <h2 className="text-lg font-semibold text-gray-900">
                  O que está incluído com cada cachorro
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {Object.entries(groups).map(([key, g]) =>
                    g.rows.length > 0 ? (
                      <div key={key}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {g.title}
                        </h3>
                        <ul className="space-y-1.5">
                          {g.rows.map((it) => (
                            <li
                              key={it.key}
                              className="flex items-center gap-2 text-sm text-gray-700"
                            >
                              <span aria-hidden="true">{it.icon}</span>
                              <span>{it.label}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </div>
              </Card>
            )
          })()}

          {/* Levar para casa */}
          {(() => {
            const opts = [
              { key: 'pickupInPerson', label: 'Recolha presencial no canil', icon: '🏠' },
              { key: 'deliveryByCar', label: 'Entrega ao domicílio', icon: '🚗' },
            ] as const
            const active = opts.filter((o) => breeder[o.key])
            if (active.length === 0 && !breeder.pickupNotes) return null
            return (
              <Card>
                <h2 className="text-lg font-semibold text-gray-900">Levar para casa</h2>
                {active.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {active.map((o) => (
                      <li key={o.key} className="flex items-center gap-2 text-sm text-gray-700">
                        <span aria-hidden="true">{o.icon}</span>
                        <span>{o.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {breeder.pickupNotes && (
                  <p className="mt-3 whitespace-pre-line text-sm text-gray-600">
                    {breeder.pickupNotes}
                  </p>
                )}
              </Card>
            )
          })()}

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
              {canWriteReview &&
                (() => {
                  // Editar uma avaliação já existente é sempre permitido — só
                  // a criação inicial é bloqueada por falta de interação.
                  if (myReview) {
                    return (
                      <Button size="sm" onClick={handleWriteReviewClick}>
                        Editar avaliação
                      </Button>
                    )
                  }
                  const elig = eligibilityQuery.data
                  const blocked = elig ? !elig.eligible : false
                  return (
                    <Button
                      size="sm"
                      onClick={handleWriteReviewClick}
                      disabled={blocked || eligibilityQuery.isLoading}
                      title={blocked ? (elig?.reason ?? undefined) : undefined}
                    >
                      Escrever avaliação
                    </Button>
                  )
                })()}
            </div>
            {canWriteReview &&
              !myReview &&
              eligibilityQuery.data &&
              !eligibilityQuery.data.eligible && (
                <p className="mt-2 text-sm text-gray-500">{eligibilityQuery.data.reason}</p>
              )}

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

            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              disabled={reviewsQuery.isFetching}
              format="full"
              withBorder
            />
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

          {/* Slot de publicidade — só renderiza se VITE_ADSENSE_ENABLED */}
          <AdContainer
            slot={AD_SLOTS.breederDetail}
            placement="breeder-detail-sidebar"
            minHeight={250}
          />

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

      <PhotoLightbox
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        photos={breeder.photos ?? []}
        startIndex={lightboxIndex ?? 0}
        alt={breeder.businessName}
      />

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
