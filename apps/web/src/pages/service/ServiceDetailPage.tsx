import { useState, lazy, Suspense } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { formatDate } from '../../lib/dates'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { Avatar } from '../../components/ui/Avatar'
import { NewThreadModal } from '../../components/messages/NewThreadModal'
import { ReportMessageModal } from '../../components/messages/ReportMessageModal'

const MiniMap = lazy(() =>
  import('../../components/map/MiniMap').then((m) => ({ default: m.MiniMap })),
)

type ServicePriceUnit = 'FIXED' | 'HOURLY' | 'PER_SESSION'

interface ServiceDetail {
  id: number
  providerId: number
  categoryId: number
  title: string
  description: string
  priceCents: number
  priceUnit: ServicePriceUnit
  currency: string
  districtId: number
  municipalityId: number
  latitude: number | null
  longitude: number | null
  serviceRadiusKm: number | null
  website: string | null
  phone: string | null
  avgRating: number | null
  reviewCount: number
  publishedAt: string | null
  createdAt: string
  photos: Array<{ id: number; url: string; sortOrder: number }>
  category: { id: number; nameSlug: string; namePt: string }
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
  provider: { id: number; firstName: string; lastName: string; avatarUrl: string | null }
}

const priceUnitSuffix: Record<ServicePriceUnit, string> = {
  FIXED: '',
  HOURLY: '/ hora',
  PER_SESSION: '/ sessão',
}

function formatPrice(cents: number, unit: ServicePriceUnit): string {
  const value = (cents / 100).toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const suffix = priceUnitSuffix[unit]
  return suffix ? `${value}€ ${suffix}` : `${value}€`
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined
    return data?.error ?? data?.message ?? err.message ?? fallback
  }
  return fallback
}

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [activePhoto, setActivePhoto] = useState(0)
  const [threadModalOpen, setThreadModalOpen] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportSuccess, setReportSuccess] = useState(false)

  const {
    data: service,
    isLoading,
    isError,
  } = useQuery<ServiceDetail>({
    queryKey: ['service', id],
    queryFn: () => api.get(`/services/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const isSelf = !!user && !!service && service.providerId === user.id

  const contactMutation = useMutation({
    mutationFn: (values: { subject: string; body: string }) =>
      api.post(`/services/${id}/contact`, values).then((r) => r.data),
    onSuccess: (res) => {
      setThreadModalOpen(false)
      setThreadError(null)
      navigate(`/painel?tab=mensagens&threadId=${res.threadId}`)
    },
    onError: (err) => {
      setThreadError(extractErrorMessage(err, 'Erro ao enviar mensagem.'))
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
      setReportError(extractErrorMessage(err, 'Erro ao enviar denúncia.'))
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

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !service) {
    return (
      <div className="page-container text-center">
        <h1 className="text-2xl font-bold text-gray-900">Anúncio não encontrado</h1>
        <p className="mt-2 text-gray-600">
          O anúncio que procura não existe ou já não está activo.
        </p>
        <Link to="/diretorio?tipo=servicos" className="btn-primary mt-6 inline-block">
          Voltar aos serviços
        </Link>
      </div>
    )
  }

  const photos = service.photos
  const activeUrl = photos[activePhoto]?.url ?? null
  const providerName = `${service.provider.firstName} ${service.provider.lastName}`.trim()

  return (
    <div className="page-container">
      <nav className="mb-6 text-sm text-gray-500">
        <Link to="/diretorio?tipo=servicos" className="hover:text-gray-700">
          Serviços
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{service.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main */}
        <div className="space-y-6 lg:col-span-2">
          {/* Gallery */}
          <Card hover={false}>
            <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-100">
              {activeUrl ? (
                <img src={activeUrl} alt={service.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                  Sem fotos
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
                Enviar mensagem
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

      <NewThreadModal
        isOpen={threadModalOpen}
        onClose={() => setThreadModalOpen(false)}
        onSubmit={(values) => contactMutation.mutate(values)}
        breederName={service.title}
        defaultSubject={`Interesse em: ${service.title}`}
        isSubmitting={contactMutation.isPending}
        errorMessage={threadError}
      />

      <ReportMessageModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onSubmit={(reason) => reportMutation.mutate(reason)}
        isSubmitting={reportMutation.isPending}
        errorMessage={reportError}
      />
    </div>
  )
}
