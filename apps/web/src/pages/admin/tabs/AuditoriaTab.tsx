import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Badge, Spinner, EmptyState, Select, Button } from '../../../components/ui'
import type { AuditLog } from '../_shared'

// Tradução de actions/entidades brutas para labels PT-PT.
// As actions historicamente foram registadas em formatos diversos
// (UPPER_SNAKE, lower.dot, PascalCase). Aqui mapeamos os mais
// frequentes para algo legivel ao admin. Para os nao mapeados
// devolvemos a string original em titlecase suave.
const actionLabel: Record<string, string> = {
  BREEDER_FEATURED: 'Criador destacado',
  CHANGE_BREEDER_STATUS: 'Estado de criador alterado',
  MESSAGE_DELETED: 'Mensagem eliminada',
  MESSAGE_EDITED: 'Mensagem editada',
  MESSAGE_SENT: 'Mensagem enviada',
  REVIEW_CREATED: 'Avaliação criada',
  REVIEW_FLAGGED: 'Avaliação sinalizada',
  SERVICE_FEATURED: 'Serviço destacado',
  SUSPEND_USER: 'Utilizador suspenso',
  THREAD_CREATED: 'Conversa criada',
  VERIFICATION_DOC_APPROVED: 'DGAV aprovado',
  VERIFICATION_DOC_REJECTED: 'DGAV rejeitado',
  VERIFICATION_DOC_APPROVED_CHANGED: 'DGAV reaprovado',
  VERIFICATION_DOC_REJECTED_CHANGED: 'DGAV re-rejeitado',
  'breeder.delete': 'Criador eliminado',
  'breeder.photos.delete': 'Foto de criador eliminada',
  'breeder.photos.reorder': 'Fotos de criador reordenadas',
  'breeder.photos.upload': 'Foto de criador enviada',
  'service.create': 'Serviço criado',
  'service.update': 'Serviço actualizado',
  'service.delete': 'Serviço eliminado',
  'service.photos.upload': 'Foto de serviço enviada',
  'service.contact.message_sent': 'Contacto: mensagem enviada',
  'service.contact.thread_created': 'Contacto: conversa iniciada',
  'sponsored_slot.delete': 'Slot patrocinado eliminado',
  'SPONSORED_SLOT.DELETE': 'Slot patrocinado eliminado',
  'SERVICE.UPDATE': 'Serviço actualizado',
}

const entityLabel: Record<string, string> = {
  User: 'Utilizador',
  Breeder: 'Criador',
  breeder: 'Criador',
  VerificationDoc: 'Verificação',
  service: 'Serviço',
  service_report: 'Denúncia de serviço',
  message: 'Mensagem',
  review: 'Avaliação',
  sponsored_slot: 'Slot patrocinado',
  thread: 'Conversa',
}

function humanizeAction(raw: string): string {
  if (actionLabel[raw]) return actionLabel[raw]
  // fallback: substituir _ e . por espacos e capitalizar 1a letra
  const cleaned = raw.replace(/[._]/g, ' ').toLowerCase()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function humanizeEntity(raw: string): string {
  return entityLabel[raw] ?? raw
}

export function AuditoriaTab() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Conjunto de IDs com a linha "detalhes" expandida. Local-only — nao
  // persiste entre paginacoes nem refetches.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState<null | 'csv' | 'json'>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // CSV escape — duplica aspas internas e envolve em aspas.
  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return `"${s.replace(/"/g, '""')}"`
  }

  function triggerDownload(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Pagina pelo backend ate esgotar resultados (limit 100, max 50 paginas
  // = 5000 registos por export — chega para inspeccoes pontuais sem
  // saturar memoria/rede). Aplica os filtros activos.
  async function fetchAllLogs(): Promise<AuditLog[]> {
    const acc: AuditLog[] = []
    const MAX_PAGES = 50
    const LIMIT = 100
    for (let p = 1; p <= MAX_PAGES; p++) {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (actionFilter) params.set('action', actionFilter)
      if (entityFilter) params.set('entity', entityFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await api.get<Paginated<AuditLog>>(`/admin/audit-logs?${params}`)
      acc.push(...res.data.data)
      if (res.data.data.length < LIMIT) break
    }
    return acc
  }

  async function handleExport(format: 'csv' | 'json') {
    setExportError(null)
    setExporting(format)
    try {
      const logs = await fetchAllLogs()
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      if (format === 'json') {
        triggerDownload(
          JSON.stringify(logs, null, 2),
          'application/json',
          `auditoria-${stamp}.json`,
        )
      } else {
        const header = [
          'id',
          'createdAt',
          'userId',
          'userName',
          'userEmail',
          'action',
          'entity',
          'entityId',
          'ipAddress',
          'details',
        ]
        const rows = logs.map((l) =>
          [
            l.id,
            l.createdAt,
            l.user?.id ?? '',
            l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
            l.user?.email ?? '',
            l.action,
            l.entity,
            l.entityId ?? '',
            l.ipAddress ?? '',
            l.details ?? '',
          ]
            .map(csvCell)
            .join(','),
        )
        // BOM \ufeff para o Excel reconhecer UTF-8 com acentos.
        const csv = '\ufeff' + [header.map(csvCell).join(','), ...rows].join('\r\n')
        triggerDownload(csv, 'text/csv;charset=utf-8', `auditoria-${stamp}.csv`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao exportar'
      setExportError(msg)
    } finally {
      setExporting(null)
    }
  }

  const { data, isLoading, isError } = useQuery<Paginated<AuditLog>>({
    queryKey: queryKeys.admin.auditLogs(
      page,
      actionFilter || undefined,
      entityFilter || undefined,
      dateFrom || undefined,
      dateTo || undefined,
    ),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (actionFilter) params.set('action', actionFilter)
      if (entityFilter) params.set('entity', entityFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      return api.get(`/admin/audit-logs?${params}`).then((r) => r.data)
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
      <EmptyState
        title="Erro ao carregar registos de auditoria"
        description="Tente novamente mais tarde."
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="w-56">
          {/*
           * As opcoes usam substrings significativas. O backend faz
           * `contains` case-insensitive, por isso "VERIFICATION" apanha
           * VERIFICATION_DOC_APPROVED, _REJECTED, _CHANGED, etc.
           * "service" apanha service.create, service.update, SERVICE.UPDATE.
           */}
          <Select
            label="Ação"
            name="actionFilter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'Todas' },
              { value: 'VERIFICATION', label: 'Verificações DGAV' },
              { value: 'BREEDER', label: 'Criadores' },
              { value: 'service', label: 'Serviços' },
              { value: 'MESSAGE', label: 'Mensagens' },
              { value: 'THREAD', label: 'Conversas' },
              { value: 'REVIEW', label: 'Avaliações' },
              { value: 'SUSPEND', label: 'Suspensões' },
              { value: 'FEATURED', label: 'Destaques' },
              { value: 'SPONSORED', label: 'Slots patrocinados' },
            ]}
          />
        </div>
        <div className="w-56">
          <Select
            label="Entidade"
            name="entityFilter"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'Todas' },
              { value: 'User', label: 'Utilizador' },
              { value: 'Breeder', label: 'Criador' },
              { value: 'VerificationDoc', label: 'Verificação' },
              { value: 'review', label: 'Avaliação' },
              { value: 'service', label: 'Serviço' },
              { value: 'service_report', label: 'Denúncia de serviço' },
              { value: 'message', label: 'Mensagem' },
              { value: 'thread', label: 'Conversa' },
              { value: 'sponsored_slot', label: 'Slot patrocinado' },
            ]}
          />
        </div>
        <div className="w-44">
          <label className="label" htmlFor="audit-date-from">
            De
          </label>
          <input
            id="audit-date-from"
            type="date"
            className="input"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="w-44">
          <label className="label" htmlFor="audit-date-to">
            Até
          </label>
          <input
            id="audit-date-to"
            type="date"
            className="input"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        {(actionFilter || entityFilter || dateFrom || dateTo) && (
          <div className="flex items-end">
            <button
              type="button"
              className="text-sm text-caramel-700 underline-offset-2 hover:underline"
              onClick={() => {
                setActionFilter('')
                setEntityFilter('')
                setDateFrom('')
                setDateTo('')
                setPage(1)
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}
        <div className="ml-auto flex items-end gap-2">
          <Button
            variant="secondary"
            onClick={() => handleExport('csv')}
            loading={exporting === 'csv'}
            disabled={exporting !== null}
            aria-label="Exportar registos em CSV"
          >
            Exportar CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleExport('json')}
            loading={exporting === 'json'}
            disabled={exporting !== null}
            aria-label="Exportar registos em JSON"
          >
            Exportar JSON
          </Button>
        </div>
      </div>
      {exportError && (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {exportError}
        </p>
      )}

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem registos" description="Nenhum registo de auditoria encontrado." />
      ) : (
        <>
          {/* Mobile: lista de cards */}
          <ul className="space-y-3 md:hidden">
            {data.data.map((log) => {
              const hasDetails = !!log.details
              const isOpen = expanded.has(log.id)
              return (
                <li key={log.id} className="rounded-lg border border-line bg-surface p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {log.user ? (
                          <>
                            {log.user.firstName} {log.user.lastName}
                          </>
                        ) : (
                          <span className="text-subtle">Sistema</span>
                        )}
                      </p>
                      {log.user && <p className="truncate text-sm text-muted">{log.user.email}</p>}
                    </div>
                    <Badge variant="blue" title={log.action}>
                      {humanizeAction(log.action)}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted">Data</dt>
                    <dd className="text-ink">{new Date(log.createdAt).toLocaleString('pt-PT')}</dd>
                    <dt className="text-muted">Entidade</dt>
                    <dd className="text-ink" title={log.entity}>
                      {humanizeEntity(log.entity)}
                    </dd>
                    <dt className="text-muted">ID</dt>
                    <dd className="font-mono text-ink">
                      {log.entityId ?? String.fromCharCode(8212)}
                    </dd>
                    <dt className="text-muted">IP</dt>
                    <dd className="text-ink">{log.ipAddress ?? String.fromCharCode(8212)}</dd>
                  </dl>
                  {hasDetails && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(log.id)}
                        className="flex items-center gap-1 text-xs text-caramel-700 underline-offset-2 hover:underline"
                        aria-expanded={isOpen}
                      >
                        <span>{isOpen ? 'Ocultar detalhes' : 'Ver detalhes'}</span>
                        <svg
                          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-line bg-surface-alt/60 p-2 font-mono text-[11px] text-ink">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Desktop: tabela tradicional */}
          <div className="hidden md:block md:overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Utilizador</th>
                  <th className="px-3 py-2">Ação</th>
                  <th className="px-3 py-2">Entidade</th>
                  <th className="px-3 py-2">ID da entidade</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log, i) => {
                  const hasDetails = !!log.details
                  const isOpen = expanded.has(log.id)
                  const detailsStr = hasDetails ? JSON.stringify(log.details, null, 2) : ''
                  return (
                    <Fragment key={log.id}>
                      <tr
                        className={`border-b border-line/60 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-ink">
                          {new Date(log.createdAt).toLocaleString('pt-PT')}
                        </td>
                        <td className="px-3 py-2 text-ink">
                          {log.user ? (
                            <div>
                              {log.user.firstName} {log.user.lastName}
                              <div className="text-xs text-muted">{log.user.email}</div>
                            </div>
                          ) : (
                            <span className="text-subtle">Sistema</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="blue" title={log.action}>
                            {humanizeAction(log.action)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-ink" title={log.entity}>
                          {humanizeEntity(log.entity)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-ink">
                          {log.entityId ?? String.fromCharCode(8212)}
                        </td>
                        <td className="px-3 py-2 text-xs text-ink">
                          {log.ipAddress ?? String.fromCharCode(8212)}
                        </td>
                        <td className="px-3 py-2 max-w-xs text-xs text-muted">
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(log.id)}
                              className="flex items-center gap-1 text-caramel-700 underline-offset-2 hover:underline"
                              aria-expanded={isOpen}
                              aria-controls={`audit-details-${log.id}`}
                            >
                              <span>{isOpen ? 'Ocultar' : 'Ver detalhes'}</span>
                              <svg
                                className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="2"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                              </svg>
                            </button>
                          ) : (
                            String.fromCharCode(8212)
                          )}
                        </td>
                      </tr>
                      {hasDetails && isOpen && (
                        <tr
                          id={`audit-details-${log.id}`}
                          className={`border-b border-line/60 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
                        >
                          <td colSpan={7} className="px-3 pb-3">
                            <pre className="whitespace-pre-wrap break-words rounded-md border border-line bg-surface-alt/60 p-3 font-mono text-xs text-ink">
                              {detailsStr}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
