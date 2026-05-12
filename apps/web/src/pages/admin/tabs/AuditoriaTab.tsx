import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Badge, Spinner, EmptyState, Select } from '../../../components/ui'
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

  const { data, isLoading, isError } = useQuery<Paginated<AuditLog>>({
    queryKey: queryKeys.admin.auditLogs(page, actionFilter || undefined, entityFilter || undefined),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (actionFilter) params.set('action', actionFilter)
      if (entityFilter) params.set('entity', entityFilter)
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
      </div>

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem registos" description="Nenhum registo de auditoria encontrado." />
      ) : (
        <>
          {/* Mobile: lista de cards */}
          <ul className="space-y-3 md:hidden">
            {data.data.map((log) => (
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
                  <dt className="text-muted">Detalhes</dt>
                  <dd className="truncate text-muted">
                    {log.details ? JSON.stringify(log.details) : String.fromCharCode(8212)}
                  </dd>
                </dl>
              </li>
            ))}
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
                {data.data.map((log, i) => (
                  <tr
                    key={log.id}
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
                    <td className="px-3 py-2 max-w-xs truncate text-xs text-muted">
                      {log.details ? JSON.stringify(log.details) : String.fromCharCode(8212)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />
        </>
      )}
    </div>
  )
}
