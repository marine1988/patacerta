import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDateShort } from '../../../lib/dates'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Card, Badge, Button, Spinner, EmptyState, Select, Modal } from '../../../components/ui'

interface MessageReportSummary {
  id: number
  reason: string
  status: string
  createdAt: string
  reviewedAt: string | null
  resolution: string | null
  reporter: { id: number; firstName: string; lastName: string; email: string }
  reviewer: { id: number; firstName: string; lastName: string; email: string } | null
  message: {
    id: number
    body: string
    createdAt: string
    editedAt: string | null
    deletedAt: string | null
    senderId: number
    threadId: number
    sender: { id: number; firstName: string; lastName: string; email: string }
  }
}

interface MessageReportDetail extends MessageReportSummary {
  message: MessageReportSummary['message'] & {
    thread: {
      id: number
      subject: string
      owner: { id: number; firstName: string; lastName: string; email: string }
      breeder: {
        id: number
        businessName: string
        user: { id: number; firstName: string; lastName: string; email: string }
      } | null
      service: {
        id: number
        title: string
        provider: { id: number; firstName: string; lastName: string; email: string }
      } | null
      messages: Array<{
        id: number
        body: string
        senderId: number
        createdAt: string
        editedAt: string | null
        deletedAt: string | null
        sender: { id: number; firstName: string; lastName: string; email: string }
      }>
    }
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

export function DenunciasTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [openReportId, setOpenReportId] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<Paginated<MessageReportSummary>>({
    queryKey: queryKeys.admin.messageReports(page, statusFilter),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        status: statusFilter,
      })
      return api.get(`/admin/message-reports?${params}`).then((r) => r.data)
    },
  })

  const { data: detail, isLoading: detailLoading } = useQuery<MessageReportDetail>({
    queryKey: queryKeys.admin.messageReport(openReportId),
    queryFn: () => api.get(`/admin/message-reports/${openReportId}`).then((r) => r.data),
    enabled: openReportId !== null,
  })

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      action,
      resolution: res,
    }: {
      id: number
      action: 'RESOLVED' | 'DISMISSED'
      resolution?: string
    }) =>
      api
        .patch(`/admin/message-reports/${id}/resolve`, { action, resolution: res })
        .then((r) => r.data),
    onSuccess: () => {
      setOpenReportId(null)
      setResolution('')
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-message-reports'] })
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
                      <span className="text-xs text-gray-500">
                        Denunciada por {r.reporter.firstName} {r.reporter.lastName} &middot;{' '}
                        {formatDateShort(r.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-900">
                      <strong>Motivo:</strong> {r.reason}
                    </p>
                    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">
                        Mensagem de {r.message.sender.firstName} {r.message.sender.lastName}{' '}
                        &middot; {formatDateShort(r.message.createdAt)}
                        {r.message.deletedAt && ' (eliminada)'}
                      </p>
                      <p
                        className={`mt-1 whitespace-pre-line text-sm ${
                          r.message.deletedAt ? 'italic text-gray-400' : 'text-gray-700'
                        }`}
                      >
                        {r.message.deletedAt ? '(mensagem eliminada pelo autor)' : r.message.body}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setOpenReportId(r.id)
                      setResolution('')
                      setActionError(null)
                    }}
                  >
                    Ver conversa
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />
        </>
      )}

      {/* Report detail modal */}
      <Modal
        isOpen={openReportId !== null}
        onClose={() => setOpenReportId(null)}
        title="Revisão de denúncia"
        size="lg"
      >
        {detailLoading || !detail ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              <strong>Atenção:</strong> está a ver conteúdo privado por motivo de moderação. Esta
              acção foi registada no log de auditoria.
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Motivo da denúncia</p>
              <p className="mt-1 text-sm text-gray-900">{detail.reason}</p>
              <p className="mt-1 text-xs text-gray-400">
                Por {detail.reporter.firstName} {detail.reporter.lastName} ({detail.reporter.email})
                &middot; {formatDateShort(detail.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">
                Conversa: {detail.message.thread.subject}
              </p>
              <p className="text-xs text-gray-400">
                Entre {detail.message.thread.owner.firstName} {detail.message.thread.owner.lastName}{' '}
                e{' '}
                {detail.message.thread.breeder
                  ? detail.message.thread.breeder.businessName
                  : (detail.message.thread.service?.title ?? '—')}
              </p>
              <div className="mt-2 max-h-[300px] space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                {detail.message.thread.messages.map((m) => {
                  const isReported = m.id === detail.message.id
                  return (
                    <div
                      key={m.id}
                      className={`rounded px-3 py-2 text-sm ${
                        isReported
                          ? 'border-2 border-red-400 bg-red-50'
                          : 'border border-gray-200 bg-white'
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-500">
                        {m.sender.firstName} {m.sender.lastName} &middot;{' '}
                        {formatDateShort(m.createdAt)}
                        {m.editedAt && ' (editada)'}
                        {m.deletedAt && ' (eliminada)'}
                        {isReported && ' — mensagem denunciada'}
                      </p>
                      <p
                        className={`mt-1 whitespace-pre-line ${
                          m.deletedAt ? 'italic text-gray-400' : 'text-gray-700'
                        }`}
                      >
                        {m.deletedAt ? '(mensagem eliminada pelo autor)' : m.body}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {detail.status === 'PENDING' ? (
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div>
                  <label className="label">Nota de resolução (opcional)</label>
                  <textarea
                    className="input min-h-[60px]"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    maxLength={500}
                  />
                  <p className="mt-1 text-xs text-gray-400">{resolution.length}/500</p>
                </div>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      resolveMutation.mutate({
                        id: detail.id,
                        action: 'DISMISSED',
                        resolution: resolution.trim() || undefined,
                      })
                    }
                    loading={resolveMutation.isPending}
                  >
                    Descartar
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      resolveMutation.mutate({
                        id: detail.id,
                        action: 'RESOLVED',
                        resolution: resolution.trim() || undefined,
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
                  <strong>Estado:</strong> {reportStatusLabel[detail.status] ?? detail.status}
                  {detail.reviewer &&
                    ` por ${detail.reviewer.firstName} ${detail.reviewer.lastName}`}
                  {detail.reviewedAt && ` em ${formatDateShort(detail.reviewedAt)}`}
                </p>
                {detail.resolution && (
                  <p className="mt-2">
                    <strong>Nota:</strong> {detail.resolution}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
