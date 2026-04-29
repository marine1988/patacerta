import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDateShort } from '../../../lib/dates'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Badge, Button, Spinner, EmptyState, Select, Modal } from '../../../components/ui'
import { type Breeder, statusBadgeVariant, statusLabel } from '../_shared'
import { FeatureToggle } from '../_components/FeatureToggle'

export function CriadoresTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [suspendingBreeder, setSuspendingBreeder] = useState<Breeder | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const breederStatusOptions = [
    { value: 'DRAFT', label: 'Rascunho' },
    { value: 'PENDING_VERIFICATION', label: 'Pendente de verificação' },
    { value: 'VERIFIED', label: 'Verificado' },
    { value: 'SUSPENDED', label: 'Suspenso' },
  ]

  const { data, isLoading, isError } = useQuery<Paginated<Breeder>>({
    queryKey: queryKeys.admin.breeders(page, statusFilter || undefined),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (statusFilter) params.set('status', statusFilter)
      return api.get(`/admin/breeders?${params}`).then((r) => r.data)
    },
  })

  // Admin so pode suspender ou reactivar. Promocao para VERIFIED acontece
  // exclusivamente via aprovacao do certificado DGAV no separador
  // "Verificações".
  const suspendMutation = useMutation({
    mutationFn: ({ breederId, reason }: { breederId: number; reason: string }) =>
      api.patch(`/admin/breeders/${breederId}/suspend`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
      setSuspendingBreeder(null)
      setSuspendReason('')
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao suspender criador.')
    },
  })
  const unsuspendMutation = useMutation({
    mutationFn: (breederId: number) => api.patch(`/admin/breeders/${breederId}/unsuspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
    },
  })

  const featureBreederMutation = useMutation({
    mutationFn: ({
      breederId,
      body,
    }: {
      breederId: number
      body: { days?: number; until?: string | null }
    }) => api.patch(`/admin/breeders/${breederId}/featured`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.home.featured() })
    },
  })

  function handleSuspend(breeder: Breeder) {
    setSuspendingBreeder(breeder)
    setSuspendReason('')
    setActionError(null)
  }
  function handleUnsuspend(breeder: Breeder) {
    if (
      !window.confirm(
        `Reactivar "${breeder.businessName}"? Volta ao estado anterior (Verificado se já tinha DGAV aprovado, caso contrário Rascunho).`,
      )
    )
      return
    unsuspendMutation.mutate(breeder.id)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState title="Erro ao carregar criadores" description="Tente novamente mais tarde." />
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
          options={[{ value: '', label: 'Todos' }, ...breederStatusOptions]}
        />
      </div>

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem criadores" description="Nenhum criador encontrado." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2">Nome comercial</th>
                  <th className="px-3 py-2">NIF</th>
                  <th className="px-3 py-2">DGAV</th>
                  <th className="px-3 py-2">Distrito</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Docs / Avaliações</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Acção</th>
                  <th className="px-3 py-2">Destaque</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((breeder, i) => {
                  const isSuspended = breeder.status === 'SUSPENDED'
                  const actionPending =
                    (suspendMutation.isPending &&
                      suspendMutation.variables?.breederId === breeder.id) ||
                    (unsuspendMutation.isPending && unsuspendMutation.variables === breeder.id)
                  return (
                    <tr
                      key={breeder.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{breeder.businessName}</div>
                        <div className="text-xs text-gray-500">
                          {breeder.user.firstName} {breeder.user.lastName}
                        </div>
                      </td>
                      <td className="px-3 py-2">{breeder.nif}</td>
                      <td className="px-3 py-2">
                        {breeder.dgavNumber || String.fromCharCode(8212)}
                      </td>
                      <td className="px-3 py-2">
                        {breeder.district?.namePt ?? String.fromCharCode(8212)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusBadgeVariant[breeder.status] ?? 'gray'}>
                          {statusLabel[breeder.status] ?? breeder.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {breeder._count.verificationDocs} / {breeder._count.reviews}
                      </td>
                      <td className="px-3 py-2">{formatDateShort(breeder.createdAt)}</td>
                      <td className="px-3 py-2">
                        {isSuspended ? (
                          <Button
                            size="sm"
                            onClick={() => handleUnsuspend(breeder)}
                            disabled={actionPending}
                          >
                            Reactivar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleSuspend(breeder)}
                            disabled={actionPending}
                          >
                            Suspender
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <FeatureToggle
                          featuredUntil={breeder.featuredUntil}
                          isPending={
                            featureBreederMutation.isPending &&
                            featureBreederMutation.variables?.breederId === breeder.id
                          }
                          onSet={(days) =>
                            featureBreederMutation.mutate({
                              breederId: breeder.id,
                              body: { days },
                            })
                          }
                          onClear={() =>
                            featureBreederMutation.mutate({
                              breederId: breeder.id,
                              body: { until: null },
                            })
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />
        </>
      )}

      {/* Suspend modal */}
      <Modal
        isOpen={suspendingBreeder !== null}
        onClose={() => setSuspendingBreeder(null)}
        title="Suspender criador"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            O perfil deixará de aparecer em pesquisas e listas. O motivo é registado no histórico.
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
            <Button variant="secondary" onClick={() => setSuspendingBreeder(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={suspendReason.trim().length < 15}
              loading={suspendMutation.isPending}
              onClick={() =>
                suspendingBreeder &&
                suspendMutation.mutate({
                  breederId: suspendingBreeder.id,
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
