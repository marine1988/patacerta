import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDateShort } from '../../../lib/dates'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Badge, Button, Spinner, EmptyState, Modal, Input } from '../../../components/ui'
import { type Review, statusBadgeVariant, statusLabel } from '../_shared'

interface ReviewFlag {
  id: number
  reason: string
  detail: string | null
  createdAt: string
  reporter: { id: number; firstName: string; lastName: string; email: string }
}

function TypeFilterTabs({
  typeFilter,
  setTypeFilter,
  setPage,
}: {
  typeFilter: 'all' | 'breeder' | 'service'
  setTypeFilter: (t: 'all' | 'breeder' | 'service') => void
  setPage: (p: number) => void
}) {
  const options: Array<{ value: 'all' | 'breeder' | 'service'; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'breeder', label: 'Criadores' },
    { value: 'service', label: 'Serviços' },
  ]
  return (
    <div className="mb-4 flex gap-2 border-b border-line">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => {
            setTypeFilter(opt.value)
            setPage(1)
          }}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            typeFilter === opt.value
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function AvaliacoesTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<'all' | 'breeder' | 'service'>('all')
  const [moderationTarget, setModerationTarget] = useState<{
    review: Review
    nextStatus: string
  } | null>(null)
  const [moderationReason, setModerationReason] = useState('')
  const [flagsTarget, setFlagsTarget] = useState<Review | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null)

  const { data, isLoading, isError } = useQuery<Paginated<Review>>({
    queryKey: queryKeys.admin.flaggedReviews(page, typeFilter),
    queryFn: () =>
      api
        .get(`/admin/reviews/flagged?page=${page}&limit=20&type=${typeFilter}`)
        .then((r) => r.data),
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['admin-flagged-reviews'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
    queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all() })
    queryClient.invalidateQueries({ queryKey: queryKeys.reviews.serviceReviewsAll() })
  }

  function endpointFor(review: Review): string {
    return review.type === 'service' ? `/service-reviews/${review.id}` : `/reviews/${review.id}`
  }

  const moderateMutation = useMutation({
    mutationFn: ({ review, status, reason }: { review: Review; status: string; reason?: string }) =>
      api.patch(`${endpointFor(review)}/moderate`, {
        status,
        ...(reason ? { reason } : {}),
      }),
    onSuccess: () => {
      invalidateAll()
      setModerationTarget(null)
      setModerationReason('')
    },
  })

  const dismissFlagsMutation = useMutation({
    mutationFn: (review: Review) => api.delete(`${endpointFor(review)}/flags`),
    onSuccess: () => invalidateAll(),
  })

  const deleteMutation = useMutation({
    mutationFn: (review: Review) => api.delete(endpointFor(review)),
    onSuccess: () => {
      invalidateAll()
      setDeleteTarget(null)
    },
  })

  const flagsQuery = useQuery<{ data: ReviewFlag[] }>({
    queryKey: queryKeys.admin.reviewFlags(flagsTarget?.type ?? null, flagsTarget?.id),
    queryFn: () => api.get(`${endpointFor(flagsTarget!)}/flags`).then((r) => r.data),
    enabled: !!flagsTarget,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState title="Erro ao carregar avaliações" description="Tente novamente mais tarde." />
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <div>
        <TypeFilterTabs typeFilter={typeFilter} setTypeFilter={setTypeFilter} setPage={setPage} />
        <EmptyState
          title="Sem avaliações sinalizadas"
          description="Não existem avaliações sinalizadas para moderar."
        />
      </div>
    )
  }

  return (
    <div>
      <TypeFilterTabs typeFilter={typeFilter} setTypeFilter={setTypeFilter} setPage={setPage} />

      {/* Mobile: lista de cards */}
      <ul className="space-y-3 md:hidden">
        {data.data.map((review) => (
          <li
            key={`${review.type ?? 'breeder'}-${review.id}-card`}
            className="rounded-lg border border-line bg-surface p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{review.title}</p>
                <p className="line-clamp-2 text-sm text-muted">{review.body}</p>
              </div>
              <Badge variant={statusBadgeVariant[review.status] ?? 'gray'}>
                {statusLabel[review.status] ?? review.status}
              </Badge>
            </div>
            <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">Tipo</dt>
              <dd>
                <Badge variant={review.type === 'service' ? 'blue' : 'gray'}>
                  {review.type === 'service' ? 'Serviço' : 'Criador'}
                </Badge>
              </dd>
              <dt className="text-muted">Alvo</dt>
              <dd className="text-ink">
                {review.type === 'service'
                  ? (review.service?.title ?? String.fromCharCode(8212))
                  : (review.breeder?.businessName ?? String.fromCharCode(8212))}
              </dd>
              <dt className="text-muted">Autor</dt>
              <dd className="text-ink">
                {review.author.firstName} {review.author.lastName}
              </dd>
              <dt className="text-muted">Nota</dt>
              <dd className="text-ink">{review.rating}/5</dd>
              <dt className="text-muted">Data</dt>
              <dd className="text-ink">{formatDateShort(review.createdAt)}</dd>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setFlagsTarget(review)}>
                Ver sinalizações
              </Button>
              <Button
                size="sm"
                onClick={() => setModerationTarget({ review, nextStatus: 'PUBLISHED' })}
              >
                Publicar
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setModerationTarget({ review, nextStatus: 'HIDDEN' })}
              >
                Ocultar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={dismissFlagsMutation.isPending}
                onClick={() => {
                  if (confirm('Descartar todas as sinalizações desta avaliação?')) {
                    dismissFlagsMutation.mutate(review)
                  }
                }}
              >
                Descartar sinalizações
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeleteTarget(review)}>
                Eliminar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: tabela tradicional */}
      <div className="hidden md:block md:overflow-x-auto">
        <table className="table-auto w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-3 py-2">Avaliação</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Alvo</th>
              <th className="px-3 py-2">Autor</th>
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((review, i) => (
              <tr
                key={`${review.type ?? 'breeder'}-${review.id}`}
                className={`border-b border-line/60 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">{review.title}</div>
                  <div className="text-xs text-muted max-w-xs truncate">{review.body}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={review.type === 'service' ? 'blue' : 'gray'}>
                    {review.type === 'service' ? 'Serviço' : 'Criador'}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-ink">
                  {review.type === 'service'
                    ? (review.service?.title ?? '—')
                    : (review.breeder?.businessName ?? '—')}
                </td>
                <td className="px-3 py-2 text-ink">
                  <div>
                    {review.author.firstName} {review.author.lastName}
                  </div>
                  <div className="text-xs text-muted">{review.author.email}</div>
                </td>
                <td className="px-3 py-2 text-ink">{review.rating}/5</td>
                <td className="px-3 py-2">
                  <Badge variant={statusBadgeVariant[review.status] ?? 'gray'}>
                    {statusLabel[review.status] ?? review.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-ink">{formatDateShort(review.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setFlagsTarget(review)}>
                      Ver sinalizações
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setModerationTarget({ review, nextStatus: 'PUBLISHED' })}
                    >
                      Publicar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setModerationTarget({ review, nextStatus: 'HIDDEN' })}
                    >
                      Ocultar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={dismissFlagsMutation.isPending}
                      onClick={() => {
                        if (confirm('Descartar todas as sinalizações desta avaliação?')) {
                          dismissFlagsMutation.mutate(review)
                        }
                      }}
                    >
                      Descartar sinalizações
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(review)}>
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />

      {/* Moderation reason modal */}
      <Modal
        isOpen={!!moderationTarget}
        onClose={() => {
          setModerationTarget(null)
          setModerationReason('')
        }}
        title={
          moderationTarget?.nextStatus === 'PUBLISHED' ? 'Publicar avaliação' : 'Ocultar avaliação'
        }
      >
        {moderationTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-alt/40 p-3 text-sm">
              <div className="font-medium text-ink">{moderationTarget.review.title}</div>
              <div className="text-muted">{moderationTarget.review.body}</div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                Motivo da moderação (opcional)
              </label>
              <Input
                value={moderationReason}
                onChange={(e) => setModerationReason(e.target.value)}
                placeholder="ex.: Conteúdo impróprio, resolvido após análise…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setModerationTarget(null)
                  setModerationReason('')
                }}
              >
                Cancelar
              </Button>
              <Button
                variant={moderationTarget.nextStatus === 'HIDDEN' ? 'danger' : 'primary'}
                disabled={moderateMutation.isPending}
                onClick={() =>
                  moderateMutation.mutate({
                    review: moderationTarget.review,
                    status: moderationTarget.nextStatus,
                    reason: moderationReason.trim() || undefined,
                  })
                }
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Flags list modal */}
      <Modal
        isOpen={!!flagsTarget}
        onClose={() => setFlagsTarget(null)}
        title="Sinalizações"
        size="lg"
      >
        {flagsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : flagsQuery.data && flagsQuery.data.data.length > 0 ? (
          <ul className="space-y-3">
            {flagsQuery.data.data.map((flag) => (
              <li key={flag.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{flag.reason}</span>
                  <span className="text-xs text-muted">{formatDateShort(flag.createdAt)}</span>
                </div>
                {flag.detail && <p className="mt-1 text-muted">{flag.detail}</p>}
                <p className="mt-1 text-xs text-muted">
                  por {flag.reporter.firstName} {flag.reporter.lastName} ({flag.reporter.email})
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Sem sinalizações"
            description="Não existem sinalizações para esta avaliação."
          />
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar avaliação"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Tem a certeza que pretende eliminar permanentemente esta avaliação? Esta ação não pode
              ser revertida.
            </p>
            <div className="rounded-lg bg-surface-alt/40 p-3 text-sm">
              <div className="font-medium text-ink">{deleteTarget.title}</div>
              <div className="text-muted">{deleteTarget.body}</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
