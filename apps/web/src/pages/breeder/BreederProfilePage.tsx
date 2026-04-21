import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { VerificationBadge } from '../../components/shared/VerificationBadge'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'


interface BreederDetail {
  id: number
  businessName: string
  nif: string
  dgavNumber: string | null
  description: string | null
  website: string | null
  phone: string | null
  status: string
  district: { id: number; namePt: string }
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
}

interface ReviewsResponse {
  data: ReviewItem[]
  meta: { page: number; limit: number; total: number; totalPages: number }
  summary: { avgRating: number | null; totalReviews: number } | null
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`h-4 w-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function BreederProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const {
    data: breeder,
    isLoading,
    isError,
  } = useQuery<BreederDetail>({
    queryKey: ['breeder', id],
    queryFn: () => api.get(`/breeders/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: reviewsData } = useQuery<ReviewsResponse>({
    queryKey: ['reviews', { breederId: id }],
    queryFn: () =>
      api
        .get('/reviews', { params: { breederId: Number(id), page: 1, limit: 10 } })
        .then((r) => r.data),
    enabled: !!id,
  })

  const reviews = reviewsData?.data ?? []
  const reviewSummary = reviewsData?.summary

  function handleSendMessage() {
    if (!user) {
      navigate('/entrar')
      return
    }
    // Navigate to dashboard messages tab — thread creation happens there
    navigate(`/painel?tab=mensagens&breederId=${id}`)
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

  return (
    <div className="page-container">
      {/* Breadcrumb */}
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
                  <h1 className="text-2xl font-bold text-gray-900">
                    {breeder.businessName}
                  </h1>
                  <VerificationBadge status={breeder.status} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z" />
                    </svg>
                    {breeder.municipality.namePt}, {breeder.district.namePt}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    Membro desde{' '}
                    {new Date(breeder.createdAt).toLocaleDateString('pt-PT', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  {reviewSummary && reviewSummary.avgRating != null && (
                    <span className="flex items-center gap-1">
                      <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="font-semibold">{reviewSummary.avgRating}</span>
                      <span className="text-gray-400">
                        ({reviewSummary.totalReviews}{' '}
                        {reviewSummary.totalReviews === 1 ? 'avaliação' : 'avaliações'})
                      </span>
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

          {/* Description */}
          {breeder.description && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Sobre</h2>
              <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                {breeder.description}
              </div>
            </Card>
          )}

          {/* DGAV info */}
          {breeder.status === 'VERIFIED' && breeder.dgavNumber && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Certificação</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-xs font-medium text-green-600">Registo DGAV</p>
                  <p className="mt-1 text-sm font-semibold text-green-800">
                    {breeder.dgavNumber}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-xs font-medium text-blue-600">NIF</p>
                  <p className="mt-1 text-sm font-semibold text-blue-800">{breeder.nif}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Reviews section */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Avaliações
                {reviewSummary && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({reviewSummary.totalReviews})
                  </span>
                )}
              </h2>
            </div>

            {reviews.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500">
                  Este criador ainda não tem avaliações.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-gray-100">
                {reviews.map((review) => (
                  <div key={review.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <Avatar
                        name={`${review.author.firstName} ${review.author.lastName}`}
                        imageUrl={review.author.avatarUrl ?? undefined}
                        size="sm"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {review.author.firstName} {review.author.lastName}
                          </span>
                          <StarRating rating={review.rating} />
                        </div>
                        <h4 className="mt-1 text-sm font-medium text-gray-800">
                          {review.title}
                        </h4>
                        {review.body && (
                          <p className="mt-1 text-sm text-gray-600">{review.body}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(review.createdAt).toLocaleDateString('pt-PT', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>

                        {/* Breeder reply */}
                        {review.reply && (
                          <div className="mt-3 rounded-lg bg-gray-50 p-3">
                            <p className="text-xs font-medium text-gray-500">
                              Resposta do criador
                            </p>
                            <p className="mt-1 text-sm text-gray-600">{review.reply}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact card */}
          <Card>
            <h3 className="text-base font-semibold text-gray-900">Contactar</h3>
            <div className="mt-4 space-y-3">
              <Button variant="primary" className="w-full" onClick={handleSendMessage}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Enviar mensagem
              </Button>

              {breeder.phone && (
                <a
                  href={`tel:${breeder.phone.replace(/\s/g, '')}`}
                  className="btn-secondary flex w-full items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
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
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  Website
                </a>
              )}
            </div>
          </Card>

          {/* Map placeholder */}
          <Card>
            <h3 className="text-base font-semibold text-gray-900">Localização</h3>
            <div className="mt-3 flex h-48 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
              Mapa — em breve
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {breeder.municipality.namePt}, {breeder.district.namePt}
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
