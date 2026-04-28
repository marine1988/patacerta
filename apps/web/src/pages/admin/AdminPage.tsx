import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatDateShort } from '../../lib/dates'
import { Pagination } from '../../components/ui/Pagination'
import type { Paginated } from '../../lib/pagination'
import { Card, Badge, Button, Spinner, EmptyState, Select, Modal, Input } from '../../components/ui'
import { PatrocinadosTab } from './PatrocinadosTab'

// Types

interface AdminStats {
  users: { total: number }
  breeders: { total: number; verified: number }
  verifications: { pending: number }
  reviews: { total: number; flagged: number }
  messages: { total: number }
}

interface VerificationDoc {
  id: number
  docType: string
  fileName: string
  status: string
  createdAt: string
  breeder: {
    id: number
    businessName: string
    nif: string
    status: string
    user: { id: number; firstName: string; lastName: string; email: string }
  }
}

interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: string
  createdAt: string
  breeder: { id: number; status: string } | null
}

interface Breeder {
  id: number
  businessName: string
  nif: string
  dgavNumber: string
  status: string
  createdAt: string
  featuredUntil: string | null
  user: { id: number; firstName: string; lastName: string; email: string }
  district: { namePt: string } | null
  _count: { verificationDocs: number; reviews: number }
}

interface Review {
  id: number
  rating: number
  title: string
  body: string
  status: string
  createdAt: string
  author: { id: number; firstName: string; lastName: string; email: string }
  breeder?: { id: number; businessName: string }
  service?: { id: number; title: string }
  type?: 'breeder' | 'service'
}

interface AuditLog {
  id: number
  userId: number | null
  action: string
  entity: string
  entityId: string | number | null
  details: unknown
  ipAddress: string | null
  createdAt: string
  user: { id: number; firstName: string; lastName: string; email: string } | null
}

// Helpers

const statusBadgeVariant: Record<string, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  VERIFIED: 'green',
  PUBLISHED: 'green',
  PENDING: 'yellow',
  PENDING_VERIFICATION: 'yellow',
  SUSPENDED: 'red',
  FLAGGED: 'red',
  DRAFT: 'gray',
  HIDDEN: 'gray',
}

const roleBadgeVariant: Record<string, 'green' | 'blue' | 'gray'> = {
  ADMIN: 'blue',
  BREEDER: 'green',
  OWNER: 'gray',
}

const statusLabel: Record<string, string> = {
  VERIFIED: 'Verificado',
  PUBLISHED: 'Publicada',
  PENDING: 'Pendente',
  PENDING_VERIFICATION: 'Pendente de verificação',
  SUSPENDED: 'Suspenso',
  FLAGGED: 'Sinalizada',
  DRAFT: 'Rascunho',
  HIDDEN: 'Oculta',
}

const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  BREEDER: 'Criador',
  OWNER: 'Utilizador',
}

// ResumoTab

function ResumoTab() {
  const {
    data: stats,
    isLoading,
    isError,
  } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !stats) {
    return (
      <EmptyState title="Erro ao carregar estatísticas" description="Tente novamente mais tarde." />
    )
  }

  const cards = [
    { label: 'Utilizadores', value: stats.users.total },
    { label: 'Criadores', value: stats.breeders.total },
    { label: 'Criadores verificados', value: stats.breeders.verified },
    { label: 'Verificações pendentes', value: stats.verifications.pending },
    { label: 'Avaliações', value: stats.reviews.total },
    { label: 'Avaliações sinalizadas', value: stats.reviews.flagged },
    { label: 'Mensagens', value: stats.messages.total },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <p className="text-sm font-medium text-gray-500">{c.label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{c.value}</p>
        </Card>
      ))}
    </div>
  )
}

// VerificacoesTab

function VerificacoesTab() {
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

// UtilizadoresTab

function UtilizadoresTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState('')
  const [suspendingUser, setSuspendingUser] = useState<User | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<Paginated<User>>({
    queryKey: ['admin-users', page, roleFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (roleFilter) params.set('role', roleFilter)
      return api.get(`/admin/users?${params}`).then((r) => r.data)
    },
  })

  const suspendMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason: string }) =>
      api.patch(`/admin/users/${userId}/suspend`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setSuspendingUser(null)
      setSuspendReason('')
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao suspender utilizador.')
    },
  })

  function handleSuspend(user: User) {
    setSuspendingUser(user)
    setSuspendReason('')
    setActionError(null)
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
      <EmptyState title="Erro ao carregar utilizadores" description="Tente novamente mais tarde." />
    )
  }

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <Select
          label="Filtrar por papel"
          name="roleFilter"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value)
            setPage(1)
          }}
          options={[
            { value: '', label: 'Todos' },
            { value: 'ADMIN', label: 'Administrador' },
            { value: 'BREEDER', label: 'Criador' },
            { value: 'OWNER', label: 'Utilizador' },
          ]}
        />
      </div>

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem utilizadores" description="Nenhum utilizador encontrado." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Papel</th>
                  <th className="px-3 py-2">Criador</th>
                  <th className="px-3 py-2">Data de registo</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((user, i) => (
                  <tr
                    key={user.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">
                      <Badge variant={roleBadgeVariant[user.role] ?? 'gray'}>
                        {roleLabel[user.role] ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {user.breeder ? (
                        <Badge variant={statusBadgeVariant[user.breeder.status] ?? 'gray'}>
                          {statusLabel[user.breeder.status] ?? user.breeder.status}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">{String.fromCharCode(8212)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatDateShort(user.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={suspendMutation.isPending}
                        onClick={() => handleSuspend(user)}
                      >
                        Suspender
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />
        </>
      )}

      {/* Suspend modal */}
      <Modal
        isOpen={suspendingUser !== null}
        onClose={() => setSuspendingUser(null)}
        title="Suspender utilizador"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            A conta deixa de poder iniciar sessão. Se for criador, o perfil também é suspenso. O
            motivo é registado no histórico.
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
            <Button variant="secondary" onClick={() => setSuspendingUser(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={suspendReason.trim().length < 15}
              loading={suspendMutation.isPending}
              onClick={() =>
                suspendingUser &&
                suspendMutation.mutate({
                  userId: suspendingUser.id,
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

// CriadoresTab

function CriadoresTab() {
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
    queryKey: ['admin-breeders', page, statusFilter],
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
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['home-featured'] })
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

// AvaliacoesTab

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
    <div className="mb-4 flex gap-2 border-b border-gray-200">
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
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function AvaliacoesTab() {
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
    queryKey: ['admin-flagged-reviews', page, typeFilter],
    queryFn: () =>
      api
        .get(`/admin/reviews/flagged?page=${page}&limit=20&type=${typeFilter}`)
        .then((r) => r.data),
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['admin-flagged-reviews'] })
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
    queryClient.invalidateQueries({ queryKey: ['reviews'] })
    queryClient.invalidateQueries({ queryKey: ['service-reviews'] })
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
    queryKey: ['review-flags', flagsTarget?.type, flagsTarget?.id],
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
      <div className="overflow-x-auto">
        <table className="table-auto w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
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
                className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{review.title}</div>
                  <div className="text-xs text-gray-500 max-w-xs truncate">{review.body}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={review.type === 'service' ? 'blue' : 'gray'}>
                    {review.type === 'service' ? 'Serviço' : 'Criador'}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {review.type === 'service'
                    ? (review.service?.title ?? '—')
                    : (review.breeder?.businessName ?? '—')}
                </td>
                <td className="px-3 py-2">
                  <div>
                    {review.author.firstName} {review.author.lastName}
                  </div>
                  <div className="text-xs text-gray-500">{review.author.email}</div>
                </td>
                <td className="px-3 py-2">{review.rating}/5</td>
                <td className="px-3 py-2">
                  <Badge variant={statusBadgeVariant[review.status] ?? 'gray'}>
                    {statusLabel[review.status] ?? review.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">{formatDateShort(review.createdAt)}</td>
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
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <div className="font-medium">{moderationTarget.review.title}</div>
              <div className="text-gray-600">{moderationTarget.review.body}</div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
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
              <li key={flag.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{flag.reason}</span>
                  <span className="text-xs text-gray-500">{formatDateShort(flag.createdAt)}</span>
                </div>
                {flag.detail && <p className="mt-1 text-gray-600">{flag.detail}</p>}
                <p className="mt-1 text-xs text-gray-500">
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
            <p className="text-sm text-gray-700">
              Tem a certeza que pretende eliminar permanentemente esta avaliação? Esta ação não pode
              ser revertida.
            </p>
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <div className="font-medium">{deleteTarget.title}</div>
              <div className="text-gray-600">{deleteTarget.body}</div>
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

// AuditoriaTab

// DenunciasTab — message reports moderation

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

function DenunciasTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [openReportId, setOpenReportId] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<Paginated<MessageReportSummary>>({
    queryKey: ['admin-message-reports', page, statusFilter],
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
    queryKey: ['admin-message-report', openReportId],
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-counts'] })
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

// ─────────────────────────────────────────────────────────────────────
// ServicosTab — moderation of services + service reports
// ─────────────────────────────────────────────────────────────────────

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

interface AdminServiceReportItem {
  id: number
  reason: string
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  createdAt: string
  reviewedAt: string | null
  resolution: string | null
  reporter: { id: number; firstName: string; lastName: string; email: string }
  service: {
    id: number
    title: string
    status: string
    provider: { id: number; firstName: string; lastName: string }
  }
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

function ServicosTab() {
  const [section, setSection] = useState<'denuncias' | 'todos'>('denuncias')

  return (
    <div>
      {/* Segmented control editorial */}
      <div className="mb-6 flex items-center gap-1 border-b border-line">
        <button
          type="button"
          onClick={() => setSection('denuncias')}
          className={`-mb-px border-b-2 px-4 py-3 text-[11px] font-medium uppercase tracking-caps transition-colors ${
            section === 'denuncias'
              ? 'border-caramel-500 text-caramel-700'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Denúncias
        </button>
        <button
          type="button"
          onClick={() => setSection('todos')}
          className={`-mb-px border-b-2 px-4 py-3 text-[11px] font-medium uppercase tracking-caps transition-colors ${
            section === 'todos'
              ? 'border-caramel-500 text-caramel-700'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Todos os anúncios
        </button>
      </div>

      {section === 'denuncias' ? <ServicosDenunciasView /> : <ServicosTodosView />}
    </div>
  )
}

function ServicosDenunciasView() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [openReportId, setOpenReportId] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // Suspend modal (separate flow)
  const [suspendingServiceId, setSuspendingServiceId] = useState<number | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  const { data, isLoading, isError } = useQuery<Paginated<AdminServiceReportItem>>({
    queryKey: ['admin-service-reports', page, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        status: statusFilter,
      })
      return api.get(`/admin/service-reports?${params}`).then((r) => r.data)
    },
  })

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      action,
      resolution: res,
    }: {
      id: number
      action: 'resolve' | 'dismiss'
      resolution: string
    }) =>
      api.patch(`/admin/service-reports/${id}/${action}`, { resolution: res }).then((r) => r.data),
    onSuccess: () => {
      setOpenReportId(null)
      setResolution('')
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-service-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-counts'] })
    },
    onError: (err: unknown) => {
      const maybeMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
          : null
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao resolver denúncia.')
    },
  })

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/admin/services/${id}/suspend`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setSuspendingServiceId(null)
      setSuspendReason('')
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-service-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-counts'] })
    },
    onError: (err: unknown) => {
      const maybeMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
          : null
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao suspender anúncio.')
    },
  })

  const openReport = data?.data.find((r) => r.id === openReportId) ?? null

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
                      <Badge variant={serviceStatusVariant[r.service.status] ?? 'gray'}>
                        {serviceStatusLabel[r.service.status] ?? r.service.status}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        Por {r.reporter.firstName} {r.reporter.lastName} &middot;{' '}
                        {formatDateShort(r.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-900">
                      <strong>Anúncio:</strong> {r.service.title}{' '}
                      <span className="text-xs text-gray-500">
                        (de {r.service.provider.firstName} {r.service.provider.lastName})
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      <strong>Motivo:</strong> {r.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setOpenReportId(r.id)
                        setResolution('')
                        setActionError(null)
                      }}
                    >
                      Ver / Resolver
                    </Button>
                    {r.status === 'PENDING' && r.service.status !== 'SUSPENDED' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setSuspendingServiceId(r.service.id)
                          setSuspendReason('')
                          setActionError(null)
                        }}
                      >
                        Suspender anúncio
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination variant="summary" meta={data.meta} page={page} onChange={setPage} />
        </>
      )}

      {/* Resolve report modal */}
      <Modal
        isOpen={openReportId !== null}
        onClose={() => setOpenReportId(null)}
        title="Revisão de denúncia"
        size="lg"
      >
        {!openReport ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500">Motivo</p>
              <p className="mt-1 text-sm text-gray-900">{openReport.reason}</p>
              <p className="mt-1 text-xs text-gray-400">
                Por {openReport.reporter.firstName} {openReport.reporter.lastName} (
                {openReport.reporter.email}) &middot; {formatDateShort(openReport.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Anúncio denunciado</p>
              <a
                href={`/servicos/${openReport.service.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-caramel-700 underline"
              >
                {openReport.service.title} ↗
              </a>
              <p className="mt-1 text-xs text-gray-400">
                {openReport.service.provider.firstName} {openReport.service.provider.lastName}
              </p>
            </div>

            {openReport.status === 'PENDING' ? (
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div>
                  <label className="label">Nota de resolução (mín. 15)</label>
                  <textarea
                    className="input min-h-[60px]"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    minLength={15}
                    maxLength={500}
                  />
                  <p className="mt-1 text-xs text-gray-400">{resolution.length}/500</p>
                </div>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    disabled={resolution.trim().length < 15}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: openReport.id,
                        action: 'dismiss',
                        resolution: resolution.trim(),
                      })
                    }
                    loading={resolveMutation.isPending}
                  >
                    Descartar
                  </Button>
                  <Button
                    variant="primary"
                    disabled={resolution.trim().length < 15}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: openReport.id,
                        action: 'resolve',
                        resolution: resolution.trim(),
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
                  <strong>Estado:</strong>{' '}
                  {reportStatusLabel[openReport.status] ?? openReport.status}
                  {openReport.reviewedAt && ` em ${formatDateShort(openReport.reviewedAt)}`}
                </p>
                {openReport.resolution && (
                  <p className="mt-2">
                    <strong>Nota:</strong> {openReport.resolution}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Suspend modal */}
      <Modal
        isOpen={suspendingServiceId !== null}
        onClose={() => setSuspendingServiceId(null)}
        title="Suspender anúncio"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            O anúncio deixará de estar visível ao público. O motivo é registado no histórico.
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
    </div>
  )
}

function ServicosTodosView() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [suspendingServiceId, setSuspendingServiceId] = useState<number | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 400)
    return () => clearTimeout(id)
  }, [q])

  const { data, isLoading, isError } = useQuery<Paginated<AdminServiceItem>>({
    queryKey: ['admin-services', page, statusFilter, debouncedQ],
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-counts'] })
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
      queryClient.invalidateQueries({ queryKey: ['home-featured'] })
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
                        onClick={() => {
                          if (window.confirm('Reactivar este anúncio?')) {
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
    </div>
  )
}

function AuditoriaTab() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  const { data, isLoading, isError } = useQuery<Paginated<AuditLog>>({
    queryKey: ['admin-audit-logs', page, actionFilter, entityFilter],
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
        <div className="w-48">
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
              { value: 'CREATE', label: 'Criar' },
              { value: 'UPDATE', label: 'Atualizar' },
              { value: 'DELETE', label: 'Eliminar' },
              { value: 'LOGIN', label: 'Login' },
              { value: 'SUSPEND', label: 'Suspender' },
              { value: 'VERIFY', label: 'Verificar' },
              { value: 'MODERATE', label: 'Moderar' },
            ]}
          />
        </div>
        <div className="w-48">
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
              { value: 'USER', label: 'Utilizador' },
              { value: 'BREEDER', label: 'Criador' },
              { value: 'REVIEW', label: 'Avaliação' },
              { value: 'VERIFICATION', label: 'Verificação' },
              { value: 'MESSAGE', label: 'Mensagem' },
              { value: 'service', label: 'Serviço' },
              { value: 'service_report', label: 'Denúncia de serviço' },
            ]}
          />
        </div>
      </div>

      {!data || data.data.length === 0 ? (
        <EmptyState title="Sem registos" description="Nenhum registo de auditoria encontrado." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
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
                    className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-PT')}
                    </td>
                    <td className="px-3 py-2">
                      {log.user ? (
                        <div>
                          {log.user.firstName} {log.user.lastName}
                          <div className="text-xs text-gray-500">{log.user.email}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Sistema</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="blue">{log.action}</Badge>
                    </td>
                    <td className="px-3 py-2">{log.entity}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {log.entityId ?? String.fromCharCode(8212)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {log.ipAddress ?? String.fromCharCode(8212)}
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-xs text-gray-500">
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

// AdminPage

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<string>('resumo')

  const tabs = [
    {
      id: 'resumo',
      label: 'Resumo',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
          />
        </svg>
      ),
      content: <ResumoTab />,
    },
    {
      id: 'verificacoes',
      label: 'Verificações',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      ),
      content: <VerificacoesTab />,
    },
    {
      id: 'utilizadores',
      label: 'Utilizadores',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
      ),
      content: <UtilizadoresTab />,
    },
    {
      id: 'criadores',
      label: 'Criadores',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
          />
        </svg>
      ),
      content: <CriadoresTab />,
    },
    {
      id: 'servicos',
      label: 'Serviços',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      ),
      content: <ServicosTab />,
    },
    {
      id: 'avaliacoes',
      label: 'Avaliações',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
      ),
      content: <AvaliacoesTab />,
    },
    {
      id: 'denuncias',
      label: 'Denúncias',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      ),
      content: <DenunciasTab />,
    },
    {
      id: 'patrocinados',
      label: 'Patrocinados',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
          />
        </svg>
      ),
      content: <PatrocinadosTab />,
    },
    {
      id: 'auditoria',
      label: 'Auditoria',
      icon: (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      ),
      content: <AuditoriaTab />,
    },
  ]

  const activeContent = tabs.find((t) => t.id === activeTab)?.content ?? tabs[0].content

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Painel de administração</h1>
        <p className="page-subtitle">
          Gerir utilizadores, criadores, verificações e conteúdo da plataforma.
        </p>
      </div>

      {/* Mobile / tablet: select dropdown */}
      <div className="mb-6 lg:hidden">
        <Select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          aria-label="Secção do painel"
          options={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
        />
      </div>

      {/* Desktop: vertical sidebar + content */}
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <nav
          className="hidden lg:block"
          aria-label="Secções do painel de administração"
          role="tablist"
          aria-orientation="vertical"
        >
          <ul className="flex flex-col gap-1 border-l border-gray-200">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`-ml-px flex w-full items-center gap-3 border-l-2 px-4 py-2 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-caramel-600 bg-caramel-50/40 text-caramel-700'
                        : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                    }`}
                  >
                    <span className="shrink-0">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div role="tabpanel" className="min-w-0">
          {activeContent}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * FeatureToggle — controlo de promocao na homepage
 *
 * Permite ao admin promover (1/7/30/90 dias) ou despromover.
 * Usado tanto na tabela de criadores como na de servicos.
 * ============================================================ */

const FEATURE_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1, label: '1 dia' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
]

function FeatureToggle({
  featuredUntil,
  isPending,
  onSet,
  onClear,
  size = 'sm',
}: {
  featuredUntil: string | null | undefined
  isPending: boolean
  onSet: (days: number) => void
  onClear: () => void
  size?: 'sm' | 'md'
}) {
  const isPromoted = featuredUntil != null && new Date(featuredUntil) > new Date()
  const sizeClasses = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className={`flex flex-wrap items-center gap-2 ${sizeClasses}`}>
      {isPromoted ? (
        <>
          <span className="inline-flex items-center gap-1 rounded bg-caramel-50 px-2 py-0.5 font-medium text-caramel-700">
            <span className="h-1.5 w-1.5 rounded-full bg-caramel-500" />
            Destaque até {new Date(featuredUntil!).toLocaleDateString('pt-PT')}
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm('Remover destaque agora?')) onClear()
            }}
            className="text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Remover
          </button>
        </>
      ) : (
        <>
          <span className="text-gray-500">Promover:</span>
          {FEATURE_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              disabled={isPending}
              onClick={() => onSet(p.days)}
              className="rounded border border-gray-300 px-2 py-0.5 hover:border-caramel-500 hover:text-caramel-700 disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </>
      )}
    </div>
  )
}
