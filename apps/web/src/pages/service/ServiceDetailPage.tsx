import { useState, lazy, Suspense } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { extractApiError } from '../../lib/errors'
import type { PaginatedMeta } from '../../lib/pagination'
import type { ServiceReviewItem } from '../../lib/reviews'
import { useAuth } from '../../hooks/useAuth'
import { usePageMeta } from '../../hooks/usePageMeta'
import { formatDate } from '../../lib/dates'
import { formatPrice } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { Avatar } from '../../components/ui/Avatar'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/EmptyState'
import { StarRating } from '../../components/shared/StarRating'
import { NewThreadModal } from '../../components/messages/NewThreadModal'
import { ReportMessageModal } from '../../components/messages/ReportMessageModal'
import { PhotoLightbox } from '../../components/shared/PhotoLightbox'
import { ReviewForm, type ReviewFormValues } from '../../components/reviews/ReviewForm'
import { FlagReviewModal } from '../../components/reviews/FlagReviewModal'
import { RatingHistogram } from '../../components/reviews/RatingHistogram'
import { ReplyReviewModal } from '../../components/reviews/ReplyReviewModal'
import { ReviewCard } from '../../components/reviews/ReviewCard'
import { Pagination } from '../../components/ui/Pagination'
import { type ServiceBase, type ServiceCategory, type ServicePhoto } from '../../lib/services'

const MiniMap = lazy(() =>
  import('../../components/map/MiniMap').then((m) => ({ default: m.MiniMap })),
)

interface ServiceDetail extends ServiceBase {
  photos: ServicePhoto[]
  category: ServiceCategory
  provider: { id: number; firstName: string; lastName: string; avatarUrl: string | null }
}

interface ServiceReviewsResponse {
  data: ServiceReviewItem[]
  meta: PaginatedMeta
  summary: {
    avgRating: number | null
    totalReviews: number
    distribution: Record<1 | 2 | 3 | 4 | 5, number>
  } | null
}

type ReviewSort = 'recent' | 'oldest' | 'highest' | 'lowest'

const REVIEWS_PAGE_SIZE = 10

/** Compoe uma descricao curta para meta description / og:description. */
function buildMetaDescription(service: ServiceDetail): string {
  const price = formatPrice(service.priceCents, service.priceUnit)
  const location = `${service.municipality.namePt}, ${service.district.namePt}`
  const summary = service.description.replace(/\s+/g, ' ').trim().slice(0, 140)
  return `${service.category.namePt} em ${location} — ${price}. ${summary}`.slice(0, 200)
}

// ─── Skeleton ────────────────────────────────────────────────────────

function ServiceDetailSkeleton() {
  return (
    <div className="page-container animate-pulse">
      <div className="mb-6 h-4 w-64 rounded bg-gray-200" />
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card hover={false}>
            <div className="aspect-[4/3] w-full rounded-lg bg-gray-200" />
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-md bg-gray-200" />
              ))}
            </div>
          </Card>
          <Card hover={false}>
            <div className="h-5 w-24 rounded bg-gray-200" />
            <div className="mt-3 h-7 w-3/4 rounded bg-gray-200" />
            <div className="mt-2 h-4 w-1/2 rounded bg-gray-200" />
          </Card>
          <Card hover={false}>
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="mt-3 space-y-2">
              <div className="h-4 w-full rounded bg-gray-200" />
              <div className="h-4 w-11/12 rounded bg-gray-200" />
              <div className="h-4 w-4/5 rounded bg-gray-200" />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card hover={false}>
            <div className="h-5 w-28 rounded bg-gray-200" />
            <div className="mt-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gray-200" />
              <div className="space-y-2">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-200" />
              </div>
            </div>
          </Card>
          <Card hover={false}>
            <div className="h-5 w-24 rounded bg-gray-200" />
            <div className="mt-4 space-y-3">
              <div className="h-10 w-full rounded bg-gray-200" />
              <div className="h-10 w-full rounded bg-gray-200" />
            </div>
          </Card>
          <Card hover={false}>
            <div className="h-5 w-28 rounded bg-gray-200" />
            <div className="mt-3 h-48 w-full rounded-lg bg-gray-200" />
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─── Bloco "Partilhar" ───────────────────────────────────────────────

function ShareLinks({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback silencioso — o utilizador pode copiar manualmente.
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="btn-secondary flex-1 text-xs"
        aria-label="Copiar link"
      >
        {copied ? 'Link copiado!' : 'Copiar link'}
      </button>
      <a
        href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary flex-1 text-xs"
        aria-label="Partilhar no WhatsApp"
      >
        WhatsApp
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary flex-1 text-xs"
        aria-label="Partilhar no Facebook"
      >
        Facebook
      </a>
    </div>
  )
}

// ─── Pagina ──────────────────────────────────────────────────────────

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activePhoto, setActivePhoto] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [threadModalOpen, setThreadModalOpen] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportSuccess, setReportSuccess] = useState(false)

  // Reviews state
  const [reviewSort, setReviewSort] = useState<ReviewSort>('recent')
  const [reviewPage, setReviewPage] = useState(1)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [editingReview, setEditingReview] = useState<ServiceReviewItem | null>(null)
  const [flagTarget, setFlagTarget] = useState<ServiceReviewItem | null>(null)
  const [replyTarget, setReplyTarget] = useState<ServiceReviewItem | null>(null)
  const [reviewActionError, setReviewActionError] = useState<string | null>(null)

  const {
    data: service,
    isLoading,
    isError,
  } = useQuery<ServiceDetail>({
    queryKey: ['service', id],
    queryFn: () => api.get(`/services/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  // SEO — so' actualiza o head depois de termos os dados; o titulo/descricao
  // sao stable em re-renders gracas a' identidade dos campos.
  usePageMeta({
    title: service ? `${service.title} — PataCerta` : 'Anúncio — PataCerta',
    description: service ? buildMetaDescription(service) : undefined,
    imageUrl: service?.photos[0]?.url,
    type: 'article',
  })

  const isSelf = !!user && !!service && service.providerId === user.id
  const canWriteReview = !!user && !isSelf

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
    queryKey: ['service-review-eligibility', { serviceId: id }],
    queryFn: () =>
      api
        .get('/service-reviews/eligibility', { params: { serviceId: Number(id) } })
        .then((r) => r.data),
    enabled: !!id && canWriteReview,
    staleTime: 30_000,
  })

  const contactMutation = useMutation({
    mutationFn: (values: { subject: string; body: string }) =>
      api.post(`/services/${id}/contact`, values).then((r) => r.data),
    onSuccess: (res) => {
      setThreadModalOpen(false)
      setThreadError(null)
      navigate(`/area-pessoal?tab=mensagens&threadId=${res.threadId}`)
    },
    onError: (err) => {
      setThreadError(extractApiError(err, 'Erro ao enviar mensagem.'))
    },
  })

  const reportMutation = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/services/${id}/report`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setReportModalOpen(false)
      setReportError(null)
      setReportSuccess(true)
    },
    onError: (err) => {
      setReportError(extractApiError(err, 'Erro ao enviar denúncia.'))
    },
  })

  // ─── Reviews ──────────────────────────────────────────────────────
  const reviewsQuery = useQuery<ServiceReviewsResponse>({
    queryKey: queryKeys.reviews.byService(id, reviewSort, reviewPage),
    queryFn: () =>
      api
        .get('/service-reviews', {
          params: {
            serviceId: Number(id),
            page: reviewPage,
            limit: REVIEWS_PAGE_SIZE,
            sort: reviewSort,
          },
        })
        .then((r) => r.data),
    enabled: !!id,
  })

  const reviews = reviewsQuery.data?.data ?? []
  const reviewSummary = reviewsQuery.data?.summary
  const reviewMeta = reviewsQuery.data?.meta
  const totalReviewPages = reviewMeta?.totalPages ?? 1
  const myReview = user ? reviews.find((r) => r.authorId === user.id) : undefined

  function invalidateReviews() {
    queryClient.invalidateQueries({ queryKey: queryKeys.reviews.serviceReviewsAll() })
    queryClient.invalidateQueries({ queryKey: ['service', id] })
    queryClient.invalidateQueries({ queryKey: ['my-service-reviews'] })
  }

  const createReviewMutation = useMutation({
    mutationFn: (values: ReviewFormValues) =>
      api.post('/service-reviews', { serviceId: Number(id), ...values }).then((r) => r.data),
    onSuccess: () => {
      setReviewModalOpen(false)
      setEditingReview(null)
      setReviewActionError(null)
      invalidateReviews()
    },
    onError: (err) => {
      setReviewActionError(extractApiError(err, 'Erro ao publicar avaliação.'))
    },
  })

  const updateReviewMutation = useMutation({
    mutationFn: ({ reviewId, values }: { reviewId: number; values: ReviewFormValues }) =>
      api.patch(`/service-reviews/${reviewId}`, values).then((r) => r.data),
    onSuccess: () => {
      setReviewModalOpen(false)
      setEditingReview(null)
      setReviewActionError(null)
      invalidateReviews()
    },
    onError: (err) => {
      setReviewActionError(extractApiError(err, 'Erro ao atualizar avaliação.'))
    },
  })

  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId: number) => api.delete(`/service-reviews/${reviewId}`),
    onSuccess: () => invalidateReviews(),
  })

  const flagReviewMutation = useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: number; reason: string }) =>
      api.post(`/service-reviews/${reviewId}/flag`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setFlagTarget(null)
      setReviewActionError(null)
      invalidateReviews()
    },
    onError: (err) => {
      setReviewActionError(extractApiError(err, 'Erro ao denunciar avaliação.'))
    },
  })

  const replyMutation = useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: number; reply: string }) =>
      api.post(`/service-reviews/${reviewId}/reply`, { reply }).then((r) => r.data),
    onSuccess: () => {
      setReplyTarget(null)
      setReviewActionError(null)
      invalidateReviews()
    },
    onError: (err) => {
      setReviewActionError(extractApiError(err, 'Erro ao publicar resposta.'))
    },
  })

  function handleSendMessageClick() {
    if (!user) {
      navigate('/entrar?next=' + encodeURIComponent(`/servicos/${id}`))
      return
    }
    if (isSelf) return
    setThreadError(null)
    setThreadModalOpen(true)
  }

  function handleReportClick() {
    if (!user) {
      navigate('/entrar?next=' + encodeURIComponent(`/servicos/${id}`))
      return
    }
    setReportError(null)
    setReportSuccess(false)
    setReportModalOpen(true)
  }

  function handleWriteReviewClick() {
    if (!user) {
      navigate('/entrar?next=' + encodeURIComponent(`/servicos/${id}`))
      return
    }
    setEditingReview(myReview ?? null)
    setReviewActionError(null)
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

  function openLightbox(idx: number) {
    setActivePhoto(idx)
    setLightboxOpen(true)
  }

  if (isLoading) {
    return <ServiceDetailSkeleton />
  }

  if (isError || !service) {
    return (
      <div className="page-container">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg
              className="h-8 w-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Anúncio não encontrado</h1>
          <p className="mt-2 text-gray-600">
            O anúncio que procura não existe, foi removido ou já não está activo.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/pesquisar?tipo=servicos" className="btn-primary">
              Ver outros serviços
            </Link>
            <Link to="/" className="btn-secondary">
              Ir para a página inicial
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const photos = service.photos
  const hasPhotos = photos.length > 0
  const activeUrl = hasPhotos ? photos[activePhoto]?.url : null
  const providerName = `${service.provider.firstName} ${service.provider.lastName}`.trim()
  const shareUrl =
    typeof window !== 'undefined' ? window.location.href : `https://patacerta.pt/servicos/${id}`

  const hasContactDetails = !!service.phone || !!service.website

  return (
    <div className="page-container">
      {/* Breadcrumbs */}
      <nav
        className="mb-6 flex flex-wrap items-center gap-1 text-sm text-gray-500"
        aria-label="Breadcrumb"
      >
        <Link to="/" className="hover:text-gray-700">
          Início
        </Link>
        <span aria-hidden="true">›</span>
        <Link to="/pesquisar?tipo=servicos" className="hover:text-gray-700">
          Serviços
        </Link>
        <span aria-hidden="true">›</span>
        <Link
          to={`/pesquisar?tipo=servicos&categoria=${service.category.id}`}
          className="hover:text-gray-700"
        >
          {service.category.namePt}
        </Link>
        <span aria-hidden="true">›</span>
        <span className="truncate text-gray-900" title={service.title}>
          {service.title}
        </span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main */}
        <div className="space-y-6 lg:col-span-2">
          {/* Gallery */}
          <Card hover={false}>
            <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-100">
              {activeUrl ? (
                <button
                  type="button"
                  onClick={() => openLightbox(activePhoto)}
                  className="group relative block h-full w-full"
                  aria-label="Ampliar foto"
                >
                  <img
                    src={activeUrl}
                    alt={service.title}
                    className="h-full w-full object-cover transition group-hover:opacity-95"
                  />
                  <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                      />
                    </svg>
                  </span>
                </button>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-gray-400">
                  <svg
                    className="h-12 w-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                    />
                  </svg>
                  <span>Sem fotos disponíveis</span>
                </div>
              )}
            </div>
            {photos.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {photos.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePhoto(idx)}
                    onDoubleClick={() => openLightbox(idx)}
                    className={`aspect-square overflow-hidden rounded-md border-2 ${
                      idx === activePhoto ? 'border-caramel-600' : 'border-transparent'
                    }`}
                    aria-label={`Foto ${idx + 1}`}
                  >
                    <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Header */}
          <Card hover={false}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge variant="blue">{service.category.namePt}</Badge>
                <h1 className="mt-2 text-2xl font-bold text-gray-900">{service.title}</h1>
                <p className="mt-1 text-sm text-gray-500">
                  {service.municipality.namePt}, {service.district.namePt}
                  {service.serviceRadiusKm !== null && (
                    <> · Desloca-se até {service.serviceRadiusKm} km</>
                  )}
                </p>
                {service.avgRating != null && service.reviewCount > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <StarRating rating={Math.round(Number(service.avgRating))} size="sm" />
                    <span className="font-semibold text-gray-900">
                      {Number(service.avgRating).toFixed(1)}
                    </span>
                    <span className="text-gray-500">({service.reviewCount})</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">
                  {formatPrice(service.priceCents, service.priceUnit)}
                </p>
                {service.publishedAt && (
                  <p className="mt-1 text-xs text-gray-500">
                    Publicado em {formatDate(service.publishedAt)}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card hover={false}>
            <h2 className="text-lg font-semibold text-gray-900">Descrição</h2>
            <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {service.description}
            </div>
          </Card>

          {/* Reviews */}
          <Card hover={false}>
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
                    value={reviewSort}
                    onChange={(e) => {
                      setReviewSort(e.target.value as ReviewSort)
                      setReviewPage(1)
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
                      ? 'Seja o primeiro a avaliar este serviço.'
                      : isSelf
                        ? 'O seu serviço ainda não tem avaliações.'
                        : !user
                          ? 'Inicie sessão para avaliar este serviço.'
                          : 'Este serviço ainda não tem avaliações.'
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
                      replyLabel="Resposta do anunciante"
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
                        ) : isSelf ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewActionError(null)
                              setReplyTarget(review)
                            }}
                            className="text-caramel-600 hover:underline"
                          >
                            {review.reply ? 'Editar resposta' : 'Responder'}
                          </button>
                        ) : (
                          user && (
                            <button
                              type="button"
                              onClick={() => {
                                setReviewActionError(null)
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
              page={reviewPage}
              totalPages={totalReviewPages}
              onChange={setReviewPage}
              disabled={reviewsQuery.isFetching}
              format="full"
              withBorder
            />
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Provider */}
          <Card hover={false}>
            <h3 className="text-base font-semibold text-gray-900">Anunciante</h3>
            <div className="mt-3 flex items-center gap-3">
              <Avatar
                name={providerName || 'Anunciante'}
                imageUrl={service.provider.avatarUrl ?? undefined}
                size="md"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{providerName || 'Anunciante'}</p>
                <p className="text-xs text-gray-500">
                  Membro desde {formatDate(service.createdAt)}
                </p>
              </div>
            </div>
          </Card>

          {/* Contact */}
          <Card hover={false}>
            <h3 className="text-base font-semibold text-gray-900">Contactar</h3>
            <div className="mt-4 space-y-3">
              <Button
                variant="primary"
                className="w-full"
                onClick={handleSendMessageClick}
                disabled={isSelf}
                title={isSelf ? 'Não pode contactar o seu próprio anúncio' : undefined}
              >
                {isSelf ? 'É o seu anúncio' : 'Enviar mensagem'}
              </Button>

              {service.phone && (
                <a
                  href={`tel:${service.phone.replace(/\s/g, '')}`}
                  className="btn-secondary flex w-full items-center justify-center gap-2"
                >
                  {service.phone}
                </a>
              )}

              {service.website && (
                <a
                  href={service.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex w-full items-center justify-center gap-2"
                >
                  Website
                </a>
              )}

              {!hasContactDetails && !isSelf && (
                <p className="text-center text-xs text-gray-500">
                  O anunciante não disponibilizou contacto directo. Use a mensagem para falar com
                  ele.
                </p>
              )}

              {!isSelf && (
                <button
                  type="button"
                  onClick={handleReportClick}
                  className="block w-full text-center text-xs text-gray-500 hover:text-red-600 hover:underline"
                >
                  Denunciar anúncio
                </button>
              )}

              {reportSuccess && (
                <p className="text-center text-xs text-green-600">Denúncia registada. Obrigado.</p>
              )}
            </div>
          </Card>

          {/* Share */}
          <Card hover={false}>
            <h3 className="text-base font-semibold text-gray-900">Partilhar</h3>
            <p className="mt-1 text-xs text-gray-500">Conhece alguém que precise deste serviço?</p>
            <div className="mt-3">
              <ShareLinks title={service.title} url={shareUrl} />
            </div>
          </Card>

          {/* Location */}
          <Card hover={false}>
            <h3 className="text-base font-semibold text-gray-900">Localização</h3>
            {service.latitude !== null && service.longitude !== null ? (
              <div className="mt-3">
                <Suspense
                  fallback={
                    <div className="flex h-48 items-center justify-center rounded-lg bg-gray-100">
                      <Spinner size="sm" />
                    </div>
                  }
                >
                  <MiniMap
                    latitude={service.latitude}
                    longitude={service.longitude}
                    label={`${service.title} · ${service.municipality.namePt}`}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="mt-3 flex h-48 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
                Sem coordenadas disponíveis
              </div>
            )}
            <p className="mt-2 text-sm text-gray-500">
              {service.municipality.namePt}, {service.district.namePt}
            </p>
          </Card>
        </div>
      </div>

      <PhotoLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={photos}
        startIndex={activePhoto}
        alt={service.title}
      />

      <NewThreadModal
        isOpen={threadModalOpen}
        onClose={() => setThreadModalOpen(false)}
        onSubmit={(values) => contactMutation.mutate(values)}
        title={`Contactar sobre: ${service.title}`}
        defaultSubject={`Interesse em: ${service.title}`}
        subjectPlaceholder="Ex.: Disponibilidade e tarifa"
        bodyPlaceholder="Olá, gostava de saber mais sobre este serviço..."
        isSubmitting={contactMutation.isPending}
        errorMessage={threadError}
      />

      <ReportMessageModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onSubmit={(reason) => reportMutation.mutate(reason)}
        title="Denunciar anúncio"
        description="Indique o motivo desta denúncia. A nossa equipa vai rever o anúncio o mais depressa possível."
        placeholder="Ex.: anúncio enganador, conteúdo impróprio, suspeita de fraude..."
        isSubmitting={reportMutation.isPending}
        errorMessage={reportError}
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
        errorMessage={reviewActionError}
      />

      <FlagReviewModal
        isOpen={!!flagTarget}
        onClose={() => setFlagTarget(null)}
        onSubmit={(reason) =>
          flagTarget && flagReviewMutation.mutate({ reviewId: flagTarget.id, reason })
        }
        isSubmitting={flagReviewMutation.isPending}
        errorMessage={reviewActionError}
      />

      <ReplyReviewModal
        isOpen={!!replyTarget}
        onClose={() => setReplyTarget(null)}
        onSubmit={(reply) =>
          replyTarget && replyMutation.mutate({ reviewId: replyTarget.id, reply })
        }
        initialValue={replyTarget?.reply ?? ''}
        isSubmitting={replyMutation.isPending}
        errorMessage={reviewActionError}
      />
    </div>
  )
}
