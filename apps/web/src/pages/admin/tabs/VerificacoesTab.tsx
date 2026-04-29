import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { formatDateShort } from '../../../lib/dates'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Button, Spinner, EmptyState, Modal } from '../../../components/ui'
import type { VerificationDoc } from '../_shared'

export function VerificacoesTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [rejectingDocId, setRejectingDocId] = useState<number | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  const { data, isLoading, isError } = useQuery<Paginated<VerificationDoc>>({
    queryKey: ['admin-verifications', page],
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
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      queryClient.invalidateQueries({ queryKey: ['admin-pending-counts'] })
    },
  })

  // Rejeitar = rejeitar o DGAV. O backend devolve o criador a DRAFT
  // para que volte a poder enviar um novo certificado.
  const rejectMutation = useMutation({
    mutationFn: ({ docId, notes }: { docId: number; notes: string }) =>
      api.patch(`/verification/${docId}/review`, { status: 'REJECTED', notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-verifications'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      queryClient.invalidateQueries({ queryKey: ['admin-pending-counts'] })
      setRejectingDocId(null)
      setRejectNotes('')
    },
  })

  function handleApprove(docId: number, businessName: string) {
    if (!window.confirm(`Aprovar DGAV de "${businessName}"? O criador ficará verificado.`)) return
    approveMutation.mutate(docId)
  }

  function openReject(docId: number) {
    setRejectingDocId(docId)
    setRejectNotes('')
  }

  function confirmReject() {
    if (rejectingDocId == null) return
    if (rejectNotes.trim().length < 5) {
      window.alert('Indique um motivo para a rejeição (pelo menos 5 caracteres).')
      return
    }
    rejectMutation.mutate({ docId: rejectingDocId, notes: rejectNotes.trim() })
  }

  async function handleViewDoc(docId: number) {
    try {
      const { data: result } = await api.get<{ url: string }>(`/verification/${docId}/view`)
      window.open(result.url, '_blank')
    } catch {
      // silently fail
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
      <div className="overflow-x-auto">
        <table className="table-auto w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
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
                className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{doc.breeder.businessName}</div>
                  <div className="text-xs text-gray-500">
                    {doc.breeder.user.firstName} {doc.breeder.user.lastName}{' '}
                    {String.fromCharCode(8212)} {doc.breeder.user.email}
                  </div>
                </td>
                <td className="px-3 py-2">{doc.breeder.nif}</td>
                <td className="px-3 py-2">{doc.docType}</td>
                <td className="px-3 py-2">
                  <button
                    className="text-caramel-600 hover:underline"
                    onClick={() => handleViewDoc(doc.id)}
                  >
                    {doc.fileName}
                  </button>
                </td>
                <td className="px-3 py-2">{formatDateShort(doc.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(doc.id, doc.breeder.businessName)}
                      disabled={approveMutation.isPending}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => openReject(doc.id)}
                      disabled={rejectMutation.isPending}
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
            className="w-full min-h-[100px] border border-line bg-white p-3 text-sm"
            style={{ borderRadius: 2 }}
          />
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
    </div>
  )
}
