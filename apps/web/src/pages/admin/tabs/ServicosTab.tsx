import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import {
  Card,
  Badge,
  Button,
  Spinner,
  EmptyState,
  Select,
  Modal,
  Input,
  useConfirm,
} from '../../../components/ui'
import { FeatureToggle } from '../_components/FeatureToggle'

/**
 * ServicosTab — listagem de todos os anuncios de servico (admin).
 *
 * Antes desta tab tinha um segmented control com as vistas "Denuncias"
 * + "Todos os anuncios", mas as denuncias migraram para a nova tab
 * "Denuncias" (que agora agrega Mensagens/Servicos/Avaliacoes). Aqui
 * fica apenas a vista de gestao de anuncios.
 */

interface AdminServiceItem {
  id: number
  title: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED'
  priceCents: number
  priceUnit: string
  currency: string
  removedAt: string | null
  removedReason: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  featuredUntil: string | null
  provider: { id: number; firstName: string; lastName: string; email: string }
  category: { id: number; nameSlug: string; namePt: string }
  district: { id: number; namePt: string } | null
  municipality: { id: number; namePt: string } | null
  photos: Array<{ url: string }>
  _count: { reports: number }
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

export function ServicosTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [suspendingServiceId, setSuspendingServiceId] = useState<number | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [confirm, confirmDialog] = useConfirm()
  const [actionError, setActionError] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 400)
    return () => clearTimeout(id)
  }, [q])

  const { data, isLoading, isError } = useQuery<Paginated<AdminServiceItem>>({
    queryKey: queryKeys.admin.services(page, statusFilter, debouncedQ),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (statusFilter) params.set('status', statusFilter)
      if (debouncedQ) params.set('q', debouncedQ)
      return api.get(`/admin/services?${params}`).then((r) => r.data)
    },
  })

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/admin/services/${id}/suspend`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setSuspendingServiceId(null)
      setSuspendReason('')
      setActionError(null)
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

  const reactivateMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/services/${id}/reactivate`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
    },
    onError: (err: unknown) => {
      const maybeMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
          : null
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao reactivar anúncio.')
    },
  })

  const featureServiceMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { days?: number; until?: string | null } }) =>
      api.patch(`/admin/services/${id}/featured`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.home.featured() })
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao alterar destaque.')
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return <EmptyState title="Erro ao carregar anúncios" description="Tente novamente." />
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input
          label="Pesquisar"
          name="q"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Título ou descrição"
        />
        <Select
          label="Estado"
          name="statusFilter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          options={[
            { value: '', label: 'Todos' },
            { value: 'ACTIVE', label: 'Activos' },
            { value: 'PAUSED', label: 'Pausados' },
            { value: 'SUSPENDED', label: 'Suspensos' },
            { value: 'DRAFT', label: 'Rascunhos' },
          ]}
        />
      </div>

      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem anúncios" description="Nenhum anúncio corresponde aos filtros." />
      ) : (
        <>
          <div className="space-y-3">
            {data.data.map((s) => (
              <Card key={s.id} hover={false}>
                <div className="flex items-start gap-3">
                  {s.photos[0]?.url ? (
                    <img
                      src={s.photos[0].url}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded bg-gray-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={serviceStatusVariant[s.status] ?? 'gray'}>
                        {serviceStatusLabel[s.status] ?? s.status}
                      </Badge>
                      <Badge variant="gray">{s.category.namePt}</Badge>
                      {s._count.reports > 0 && (
                        <Badge variant="red">{s._count.reports} denúncia(s)</Badge>
                      )}
                    </div>
                    <a
                      href={`/servicos/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block text-sm font-medium text-gray-900 hover:text-caramel-700"
                    >
                      {s.title} ↗
                    </a>
                    <p className="text-xs text-gray-500">
                      {s.provider.firstName} {s.provider.lastName} &middot; {s.provider.email}
                      {s.district && ` · ${s.district.namePt}`}
                    </p>
                    {s.status === 'SUSPENDED' && s.removedReason && (
                      <p className="mt-1 text-xs text-red-600">
                        <strong>Motivo:</strong> {s.removedReason}
                      </p>
                    )}
                    {s.status === 'ACTIVE' && (
                      <div className="mt-2">
                        <FeatureToggle
                          featuredUntil={s.featuredUntil}
                          isPending={
                            featureServiceMutation.isPending &&
                            featureServiceMutation.variables?.id === s.id
                          }
                          onSet={(days) =>
                            featureServiceMutation.mutate({ id: s.id, body: { days } })
                          }
                          onClear={() =>
                            featureServiceMutation.mutate({ id: s.id, body: { until: null } })
                          }
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {s.status === 'SUSPENDED' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={
                          reactivateMutation.isPending && reactivateMutation.variables === s.id
                        }
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Reactivar anúncio',
                            message: 'Reactivar este anúncio?',
                            confirmLabel: 'Reactivar',
                          })
                          if (ok) {
                            reactivateMutation.mutate(s.id)
                          }
                        }}
                      >
                        Reactivar
                      </Button>
                    ) : (
                      s.status !== 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setSuspendingServiceId(s.id)
                            setSuspendReason('')
                            setActionError(null)
                          }}
                        >
                          Suspender
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />
        </>
      )}

      <Modal
        isOpen={suspendingServiceId !== null}
        onClose={() => setSuspendingServiceId(null)}
        title="Suspender anúncio"
        size="md"
      >
        <div className="space-y-3">
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
      {confirmDialog}
    </div>
  )
}
