import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDateShort } from '../../../lib/dates'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Button, Spinner, EmptyState, Modal, useConfirm } from '../../../components/ui'
import type { VerificationDoc } from '../_shared'

export function VerificacoesTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [rejectingDocId, setRejectingDocId] = useState<number | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()

  const { data, isLoading, isError } = useQuery<Paginated<VerificationDoc>>({
    queryKey: queryKeys.admin.verifications(page),
    queryFn: () =>
      api.get(`/admin/verifications/pending?page=${page}&limit=20`).then((r) => r.data),
  })

  // Aprovar = aprovar o documento DGAV. O backend trata de promover o
  // criador a VERIFIED automaticamente. Nao ha "aprovar criador" directo.
  const approveMutation = useMutation({
    mutationFn: (docId: number) =>
      api.patch(`/verification/${docId}/review`, { status: 'APPROVED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-verifications'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCounts() })
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao aprovar certificado.')
    },
  })

  // Rejeitar = rejeitar o DGAV. O backend devolve o criador a DRAFT
  // para que volte a poder enviar um novo certificado.
  const rejectMutation = useMutation({
    mutationFn: ({ docId, notes }: { docId: number; notes: string }) =>
      api.patch(`/verification/${docId}/review`, { status: 'REJECTED', notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-verifications'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCounts() })
      setRejectingDocId(null)
      setRejectNotes('')
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao rejeitar certificado.')
    },
  })

  async function handleApprove(docId: number, businessName: string) {
    const ok = await confirm({
      title: 'Aprovar DGAV',
      message: `Aprovar DGAV de "${businessName}"? O criador ficará verificado.`,
      confirmLabel: 'Aprovar',
    })
    if (!ok) return
    setActionError(null)
    approveMutation.mutate(docId)
  }

  function openReject(docId: number) {
    setRejectingDocId(docId)
    setRejectNotes('')
    setActionError(null)
  }

  function confirmReject() {
    if (rejectingDocId == null) return
    if (rejectNotes.trim().length < 5) {
      setActionError('Indique um motivo para a rejeição (pelo menos 5 caracteres).')
      return
    }
    setActionError(null)
    rejectMutation.mutate({ docId: rejectingDocId, notes: rejectNotes.trim() })
  }

  async function handleViewDoc(docId: number) {
    try {
      // Fetch via API (autenticado) e abrir em blob URL. Evita expor
      // presigned URLs do MinIO (que em stage/prod apontam para o
      // hostname interno Docker e falham no browser).
      const res = await api.get(`/verification/${docId}/file`, {
        responseType: 'blob',
      })
      const blobUrl = URL.createObjectURL(res.data as Blob)
      const win = window.open(blobUrl, '_blank')
      // Se o popup foi bloqueado, libertar a memoria imediatamente.
      if (!win) {
        URL.revokeObjectURL(blobUrl)
        setActionError('O navegador bloqueou a janela. Permita pop-ups para este site.')
      }
      // Senao, deixar o browser libertar quando a tab fechar — nao temos
      // hook fiavel para detectar isso de outra origem.
    } catch (err) {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao abrir o certificado.')
    }
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
      <EmptyState title="Erro ao carregar verificações" description="Tente novamente mais tarde." />
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <EmptyState
        title="Sem verificações pendentes"
        description="Não existem certificados DGAV pendentes de revisão."
      />
    )
  }

  return (
    <div>
      {actionError && (
        <div
          role="alert"
          className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}
      {/* Mobile: lista de cards */}
      <ul className="space-y-3 md:hidden">
        {data.data.map((doc) => (
          <li key={doc.id} className="rounded-lg border border-line bg-surface p-4 shadow-sm">
            <div className="mb-2">
              <p className="truncate font-medium text-ink">{doc.breeder.businessName}</p>
              <p className="truncate text-sm text-muted">
                {doc.breeder.user.firstName} {doc.breeder.user.lastName} {'\u2014'}{' '}
                {doc.breeder.user.email}
              </p>
            </div>
            <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">NIF</dt>
              <dd className="text-ink">{doc.breeder.nif}</dd>
              <dt className="text-muted">DGAV</dt>
              <dd className="text-ink">{doc.docType}</dd>
              <dt className="text-muted">Ficheiro</dt>
              <dd>
                <button
                  className="text-caramel-600 hover:underline"
                  onClick={() => handleViewDoc(doc.id)}
                >
                  {doc.fileName}
                </button>
              </dd>
              <dt className="text-muted">Data</dt>
              <dd className="text-ink">{formatDateShort(doc.createdAt)}</dd>
            </dl>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                onClick={() => handleApprove(doc.id, doc.breeder.businessName)}
                loading={approveMutation.isPending}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => openReject(doc.id)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                Rejeitar
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
              <th className="px-3 py-2">Criador</th>
              <th className="px-3 py-2">NIF</th>
              <th className="px-3 py-2">DGAV</th>
              <th className="px-3 py-2">Ficheiro</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((doc, i) => (
              <tr
                key={doc.id}
                className={`border-b border-line/60 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">{doc.breeder.businessName}</div>
                  <div className="text-xs text-muted">
                    {doc.breeder.user.firstName} {doc.breeder.user.lastName}{' '}
                    {'\u2014'} {doc.breeder.user.email}
                  </div>
                </td>
                <td className="px-3 py-2 text-ink">{doc.breeder.nif}</td>
                <td className="px-3 py-2 text-ink">{doc.docType}</td>
                <td className="px-3 py-2">
                  <button
                    className="text-caramel-600 hover:underline"
                    onClick={() => handleViewDoc(doc.id)}
                  >
                    {doc.fileName}
                  </button>
                </td>
                <td className="px-3 py-2 text-ink">{formatDateShort(doc.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(doc.id, doc.breeder.businessName)}
                      loading={approveMutation.isPending}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => openReject(doc.id)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                    >
                      Rejeitar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />

      <Modal
        isOpen={rejectingDocId !== null}
        onClose={() => setRejectingDocId(null)}
        title="Rejeitar certificado DGAV"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Indique o motivo da rejeição. O criador volta ao estado <strong>Rascunho</strong> para
            poder enviar um novo certificado.
          </p>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Ex.: certificado ilegível, fora do prazo, NIF não corresponde, etc."
            className="w-full min-h-[100px] border border-line bg-surface p-3 text-sm text-ink"
            style={{ borderRadius: 2 }}
            aria-label="Motivo da rejeição"
          />
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectingDocId(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmReject} loading={rejectMutation.isPending}>
              Rejeitar
            </Button>
          </div>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  )
}
