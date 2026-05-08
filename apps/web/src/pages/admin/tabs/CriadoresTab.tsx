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
          {/* Mobile: lista de cards */}
          <ul className="space-y-3 md:hidden">
            {data.data.map((breeder) => {
              const isSuspended = breeder.status === 'SUSPENDED'
              const actionPending =
                (suspendMutation.isPending &&
                  suspendMutation.variables?.breederId === breeder.id) ||
                (unsuspendMutation.isPending && unsuspendMutation.variables === breeder.id)
              return (
                <li
                  key={breeder.id}
                  className="rounded-lg border border-line bg-surface p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{breeder.businessName}</p>
                      <p className="truncate text-sm text-muted">
                        {breeder.user.firstName} {breeder.user.lastName}
                      </p>
                    </div>
                    <Badge variant={statusBadgeVariant[breeder.status] ?? 'gray'}>
                      {statusLabel[breeder.status] ?? breeder.status}
                    </Badge>
                  </div>
                  <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted">NIF</dt>
                    <dd className="text-ink">{breeder.nif}</dd>
                    <dt className="text-muted">DGAV</dt>
                    <dd className="text-ink">{breeder.dgavNumber || String.fromCharCode(8212)}</dd>
                    <dt className="text-muted">Distrito</dt>
                    <dd className="text-ink">
                      {breeder.district?.namePt ?? String.fromCharCode(8212)}
                    </dd>
                    <dt className="text-muted">Docs / Avaliações</dt>
                    <dd className="text-ink">
                      {breeder._count.verificationDocs} / {breeder._count.reviews}
                    </dd>
                    <dt className="text-muted">Data</dt>
                    <dd className="text-ink">{formatDateShort(breeder.createdAt)}</dd>
                  </dl>
                  <div className="mb-3">
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
                  </div>
                  <div className="flex justify-end">
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
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Desktop: tabela com larguras fixas para evitar scroll horizontal.
           *
           * Estrategia: table-fixed + colgroup com larguras explicitas. Sem
           * isto, o table-auto deixaria o browser distribuir o espaco e os
           * conteudos longos (Nome comercial, motivos, etc) faziam overflow
           * forcando scroll horizontal — especialmente apertado quando a
           * sidebar do AdminPage esta expandida (220px).
           *
           * Larguras escolhidas com base no conteudo real:
           *   Nome comercial: auto (col flexivel) com truncate
           *   NIF: 9ch (sempre 9 digitos)
           *   DGAV: 12ch (formato "DGAV-2020-077" ou "pt-504651")
           *   Distrito: 9rem (nomes tipo "Viana do Castelo" cabem em 2 linhas)
           *   Estado: 8rem (badges "Pendente de verificação" precisam espaco)
           *   Docs/Aval: 5rem (formato "1 / 0")
           *   Data: 6rem (formato curto "28/04/2026")
           *   Accao: 7rem (botao Suspender/Reactivar)
           *   Destaque: 8rem (FeatureToggle compacto)
           */}
          <div className="hidden md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[6.5rem]" />
                <col className="w-[8rem]" />
                <col className="w-[7rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[5rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[8rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-3 py-2">Nome comercial</th>
                  <th className="px-3 py-2">NIF</th>
                  <th className="px-3 py-2">DGAV</th>
                  <th className="px-3 py-2">Distrito</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Docs/Aval.</th>
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
                  const ownerName = `${breeder.user.firstName} ${breeder.user.lastName}`
                  return (
                    <tr
                      key={breeder.id}
                      className={`border-b border-line/60 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
                    >
                      <td className="px-3 py-2">
                        {/* min-w-0 + truncate dentro da celula:
                         * o div precisa ser block para o truncate funcionar,
                         * e o `title` serve fallback para nomes cortados. */}
                        <div className="min-w-0">
                          <div
                            className="truncate font-medium text-ink"
                            title={breeder.businessName}
                          >
                            {breeder.businessName}
                          </div>
                          <div className="truncate text-xs text-muted" title={ownerName}>
                            {ownerName}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-ink truncate" title={breeder.nif}>
                        {breeder.nif}
                      </td>
                      <td
                        className="px-3 py-2 text-ink truncate"
                        title={breeder.dgavNumber || undefined}
                      >
                        {breeder.dgavNumber || String.fromCharCode(8212)}
                      </td>
                      <td className="px-3 py-2 text-ink" title={breeder.district?.namePt}>
                        {breeder.district?.namePt ?? String.fromCharCode(8212)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusBadgeVariant[breeder.status] ?? 'gray'}>
                          {statusLabel[breeder.status] ?? breeder.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {breeder._count.verificationDocs} / {breeder._count.reviews}
                      </td>
                      <td className="px-3 py-2 text-ink">{formatDateShort(breeder.createdAt)}</td>
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
          <p className="text-sm text-muted">
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
            <p className="mt-1 text-xs text-subtle">{suspendReason.length}/500</p>
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
