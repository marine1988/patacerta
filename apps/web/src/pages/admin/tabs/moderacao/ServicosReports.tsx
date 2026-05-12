import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../../lib/api'
import { queryKeys } from '../../../../lib/queryKeys'
import { formatDateShort } from '../../../../lib/dates'
import { Pagination } from '../../../../components/ui/Pagination'
import type { Paginated } from '../../../../lib/pagination'
import { Card, Badge, Button, Spinner, EmptyState, Select, Modal } from '../../../../components/ui'

/**
 * Vista de denuncias de servicos (anuncios). Anteriormente vivia em
 * ServicosTab.tsx como sub-tab "Denuncias"; foi extraida para este
 * sub-componente da nova tab "Moderacao".
 */

interface AdminServiceReportItem {
  id: number
  reason: string
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  createdAt: string
  reviewedAt: string | null
  resolution: string | null
  reporter: { id: number; firstName: string; lastName: string; email: string }
  service: {
    id: number
    title: string
    status: string
    provider: { id: number; firstName: string; lastName: string }
  }
}

const reportStatusVariant: Record<string, 'yellow' | 'green' | 'gray'> = {
  PENDING: 'yellow',
  RESOLVED: 'green',
  DISMISSED: 'gray',
}
const reportStatusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  RESOLVED: 'Resolvida',
  DISMISSED: 'Descartada',
}

const serviceStatusVariant: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  DRAFT: 'gray',
  ACTIVE: 'green',
  PAUSED: 'yellow',
  SUSPENDED: 'red',
}
const serviceStatusLabel: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  SUSPENDED: 'Suspenso',
}

export function ServicosReportsView() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [openReportId, setOpenReportId] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // Suspend modal (separate flow)
  const [suspendingServiceId, setSuspendingServiceId] = useState<number | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  const { data, isLoading, isError } = useQuery<Paginated<AdminServiceReportItem>>({
    queryKey: queryKeys.admin.serviceReports(page, statusFilter),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        status: statusFilter,
      })
      return api.get(`/admin/service-reports?${params}`).then((r) => r.data)
    },
  })

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      action,
      resolution: res,
    }: {
      id: number
      action: 'resolve' | 'dismiss'
      resolution: string
    }) =>
      api.patch(`/admin/service-reports/${id}/${action}`, { resolution: res }).then((r) => r.data),
    onSuccess: () => {
      setOpenReportId(null)
      setResolution('')
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-service-reports'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCounts() })
    },
    onError: (err: unknown) => {
      const maybeMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
          : null
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao resolver denúncia.')
    },
  })

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/admin/services/${id}/suspend`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setSuspendingServiceId(null)
      setSuspendReason('')
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-service-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCounts() })
    },
    onError: (err: unknown) => {
      const maybeMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
          : null
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao suspender anúncio.')
    },
  })

  const openReport = data?.data.find((r) => r.id === openReportId) ?? null

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState title="Erro ao carregar denúncias" description="Tente novamente mais tarde." />
    )
  }

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <Select
          label="Filtrar por estado"
          name="statusFilter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          options={[
            { value: 'PENDING', label: 'Pendentes' },
            { value: 'RESOLVED', label: 'Resolvidas' },
            { value: 'DISMISSED', label: 'Descartadas' },
          ]}
        />
      </div>

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem denúncias" description="Nenhuma denúncia neste estado." />
      ) : (
        <>
          <div className="space-y-3">
            {data.data.map((r) => (
              <Card key={r.id} hover={false}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={reportStatusVariant[r.status] ?? 'gray'}>
                        {reportStatusLabel[r.status] ?? r.status}
                      </Badge>
                      <Badge variant={serviceStatusVariant[r.service.status] ?? 'gray'}>
                        {serviceStatusLabel[r.service.status] ?? r.service.status}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        Por {r.reporter.firstName} {r.reporter.lastName} &middot;{' '}
                        {formatDateShort(r.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-900">
                      <strong>Anúncio:</strong> {r.service.title}{' '}
                      <span className="text-xs text-gray-500">
                        (de {r.service.provider.firstName} {r.service.provider.lastName})
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      <strong>Motivo:</strong> {r.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setOpenReportId(r.id)
                        setResolution('')
                        setActionError(null)
                      }}
                    >
                      Ver / Resolver
                    </Button>
                    {r.status === 'PENDING' && r.service.status !== 'SUSPENDED' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setSuspendingServiceId(r.service.id)
                          setSuspendReason('')
                          setActionError(null)
                        }}
                      >
                        Suspender anúncio
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />
        </>
      )}

      {/* Resolve report modal */}
      <Modal
        isOpen={openReportId !== null}
        onClose={() => setOpenReportId(null)}
        title="Revisão de denúncia"
        size="lg"
      >
        {!openReport ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500">Motivo</p>
              <p className="mt-1 text-sm text-gray-900">{openReport.reason}</p>
              <p className="mt-1 text-xs text-gray-400">
                Por {openReport.reporter.firstName} {openReport.reporter.lastName} (
                {openReport.reporter.email}) &middot; {formatDateShort(openReport.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Anúncio denunciado</p>
              <a
                href={`/servicos/${openReport.service.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-caramel-700 underline"
              >
                {openReport.service.title} ↗
              </a>
              <p className="mt-1 text-xs text-gray-400">
                {openReport.service.provider.firstName} {openReport.service.provider.lastName}
              </p>
            </div>

            {openReport.status === 'PENDING' ? (
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div>
                  <label className="label">Nota de resolução (mín. 15)</label>
                  <textarea
                    className="input min-h-[60px]"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    minLength={15}
                    maxLength={500}
                  />
                  <p className="mt-1 text-xs text-gray-400">{resolution.length}/500</p>
                </div>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    disabled={resolution.trim().length < 15}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: openReport.id,
                        action: 'dismiss',
                        resolution: resolution.trim(),
                      })
                    }
                    loading={resolveMutation.isPending}
                  >
                    Descartar
                  </Button>
                  <Button
                    variant="primary"
                    disabled={resolution.trim().length < 15}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: openReport.id,
                        action: 'resolve',
                        resolution: resolution.trim(),
                      })
                    }
                    loading={resolveMutation.isPending}
                  >
                    Marcar como resolvida
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-gray-200 pt-4 text-sm text-gray-500">
                <p>
                  <strong>Estado:</strong>{' '}
                  {reportStatusLabel[openReport.status] ?? openReport.status}
                  {openReport.reviewedAt && ` em ${formatDateShort(openReport.reviewedAt)}`}
                </p>
                {openReport.resolution && (
                  <p className="mt-2">
                    <strong>Nota:</strong> {openReport.resolution}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Suspend modal */}
      <Modal
        isOpen={suspendingServiceId !== null}
        onClose={() => setSuspendingServiceId(null)}
        title="Suspender anúncio"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            O anúncio deixará de estar visível ao público. O motivo é registado no histórico.
          </p>
          <div>
            <label className="label">Motivo (mín. 15, máx. 500)</label>
            <textarea
              className="input min-h-[80px]"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              minLength={15}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-gray-400">{suspendReason.length}/500</p>
          </div>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSuspendingServiceId(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={suspendReason.trim().length < 15}
              loading={suspendMutation.isPending}
              onClick={() =>
                suspendingServiceId !== null &&
                suspendMutation.mutate({
                  id: suspendingServiceId,
                  reason: suspendReason.trim(),
                })
              }
            >
              Suspender
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
