import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDateShort } from '../../../lib/dates'
import { extractApiError } from '../../../lib/errors'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Badge, Spinner, EmptyState, Select } from '../../../components/ui'
import { type Breeder, statusBadgeVariant, statusLabel } from '../_shared'
import { FeatureToggle } from '../_components/FeatureToggle'

export function CriadoresTab() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
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

  // Suspender/Reactivar foram movidos para a pagina de detalhe
  // (/admin/criadores/:id) — a tabela e' apenas overview navegavel.
  // Isto reduz a pressao horizontal das colunas e evita que o botao
  // 'Suspender' (vermelho, larga acçao destrutiva) seja clicavel
  // acidentalmente. Destaque mantem-se na tabela porque e' frequente
  // (toggle rapido) e idempotente.

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
      setActionError(null)
    },
    onError: (err: unknown) => {
      setActionError(extractApiError(err, 'Erro ao alterar destaque.'))
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

      {actionError && (
        <div
          role="alert"
          className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem criadores" description="Nenhum criador encontrado." />
      ) : (
        <>
          {/* Mobile: lista de cards */}
          <ul className="space-y-3 md:hidden">
            {data.data.map((breeder) => {
              return (
                <li
                  key={breeder.id}
                  onClick={() => navigate(`/admin/criadores/${breeder.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/admin/criadores/${breeder.id}`)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver detalhes de ${breeder.businessName}`}
                  className="cursor-pointer rounded-lg border border-line bg-surface p-4 shadow-sm transition-colors hover:border-caramel-300 hover:bg-caramel-50/30 focus:outline-none focus:ring-2 focus:ring-caramel-500"
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
                  <div onClick={(e) => e.stopPropagation()}>
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
           * Distrito e Accao (Suspender) foram removidos da tabela:
           *  - Distrito esta visivel na pagina de detalhe e raramente e'
           *    o filtro principal aqui (filtro principal = Estado, ja em
           *    cima)
           *  - Suspender/Reactivar agora vivem na pagina de detalhe
           *    /admin/criadores/:id, onde o admin tem mais contexto antes
           *    de uma accao destrutiva.
           *
           * Isto liberta ~13.5rem que vao para a coluna Destaque (que
           * agora pode mostrar os 4 pills 'Promover: 1 dia | 7 dias |
           * 30 dias | 90 dias' sem encavalitar).
           *
           * Larguras escolhidas com base no conteudo real:
           *   Nome comercial: auto (col flexivel) com truncate
           *   NIF: 6.5rem (sempre 9 digitos)
           *   DGAV: 8rem (formato 'DGAV-2020-077' ou 'pt-504651')
           *   Estado: 8.5rem (badge 'Pendente de verificação' em 2 linhas)
           *   Docs/Aval: 5rem (formato '1 / 0')
           *   Data: 5.5rem (formato curto '28/04/2026')
           *   Destaque: 13rem (4 pills compactos '1d/7d/30d/90d' +
           *     'Promover:' label, ou 'Destaque até dd/mm/yyyy' + 'Remover')
           */}
          <div className="hidden md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[6.5rem]" />
                <col className="w-[8rem]" />
                <col className="w-[8.5rem]" />
                <col className="w-[5rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[13rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-3 py-2">Nome comercial</th>
                  <th className="px-3 py-2">NIF</th>
                  <th className="px-3 py-2">DGAV</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Docs/Aval.</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Destaque</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((breeder, i) => {
                  const ownerName = `${breeder.user.firstName} ${breeder.user.lastName}`
                  return (
                    <tr
                      key={breeder.id}
                      onClick={() => navigate(`/admin/criadores/${breeder.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/admin/criadores/${breeder.id}`)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver detalhes de ${breeder.businessName}`}
                      className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-caramel-50/40 focus:outline-none focus:bg-caramel-50/60 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
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
                      <td className="px-3 py-2">
                        <Badge variant={statusBadgeVariant[breeder.status] ?? 'gray'}>
                          {statusLabel[breeder.status] ?? breeder.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {breeder._count.verificationDocs} / {breeder._count.reviews}
                      </td>
                      <td className="px-3 py-2 text-ink">{formatDateShort(breeder.createdAt)}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
    </div>
  )
}
