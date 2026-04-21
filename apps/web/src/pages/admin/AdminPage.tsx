import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Tabs, Card, Badge, Button, Spinner, EmptyState, Select } from '../../components/ui'

// Types

interface AdminStats {
  users: { total: number }
  breeders: { total: number; verified: number }
  verifications: { pending: number }
  reviews: { total: number; flagged: number }
  messages: { total: number }
}

interface PaginatedMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Paginated<T> {
  data: T[]
  meta: PaginatedMeta
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
  breeder: { id: number; businessName: string }
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-PT')
}

function PaginationBar({
  meta,
  page,
  setPage,
}: {
  meta: PaginatedMeta
  page: number
  setPage: (p: number) => void
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-gray-500">
        A mostrar {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}
        {String.fromCharCode(8211)}
        {Math.min(meta.page * meta.limit, meta.total)} de {meta.total} resultados
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= meta.totalPages}
          onClick={() => setPage(page + 1)}
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}

// ResumoTab

function ResumoTab() {
  const { data: stats, isLoading, isError } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/api/admin/stats').then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !stats) {
    return <EmptyState title="Erro ao carregar estatísticas" description="Tente novamente mais tarde." />
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

  const { data, isLoading, isError } = useQuery<Paginated<VerificationDoc>>({
    queryKey: ['admin-verifications', page],
    queryFn: () =>
      api.get(`/api/admin/verifications/pending?page=${page}&limit=20`).then((r) => r.data),
  })

  const approveMutation = useMutation({
    mutationFn: (breederId: number) =>
      api.patch(`/api/admin/breeders/${breederId}/status`, { status: 'VERIFIED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-verifications'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

  function handleApprove(breederId: number, businessName: string) {
    if (!window.confirm(`Tem a certeza que pretende aprovar o criador "${businessName}"?`)) return
    approveMutation.mutate(breederId)
  }

  async function handleViewDoc(docId: number) {
    try {
      const { data: result } = await api.get<{ url: string }>(`/api/verification/${docId}/view`)
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
    return <EmptyState title="Erro ao carregar verificações" description="Tente novamente mais tarde." />
  }

  if (!data || data.data.length === 0) {
    return (
      <EmptyState
        title="Sem verificações pendentes"
        description="Não existem documentos pendentes de revisão."
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
              <th className="px-3 py-2">Tipo</th>
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
                    {doc.breeder.user.firstName} {doc.breeder.user.lastName} {String.fromCharCode(8212)} {doc.breeder.user.email}
                  </div>
                </td>
                <td className="px-3 py-2">{doc.breeder.nif}</td>
                <td className="px-3 py-2">{doc.docType}</td>
                <td className="px-3 py-2">
                  <button
                    className="text-primary-600 hover:underline"
                    onClick={() => handleViewDoc(doc.id)}
                  >
                    {doc.fileName}
                  </button>
                </td>
                <td className="px-3 py-2">{formatDate(doc.createdAt)}</td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(doc.breeder.id, doc.breeder.businessName)}
                    disabled={approveMutation.isPending}
                  >
                    Aprovar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationBar meta={data.meta} page={page} setPage={setPage} />
    </div>
  )
}

// UtilizadoresTab

function UtilizadoresTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState('')

  const { data, isLoading, isError } = useQuery<Paginated<User>>({
    queryKey: ['admin-users', page, roleFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (roleFilter) params.set('role', roleFilter)
      return api.get(`/api/admin/users?${params}`).then((r) => r.data)
    },
  })

  const suspendMutation = useMutation({
    mutationFn: (userId: number) => api.patch(`/api/admin/users/${userId}/suspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

  function handleSuspend(user: User) {
    if (
      !window.confirm(
        `Tem a certeza que pretende suspender o utilizador "${user.firstName} ${user.lastName}"?`,
      )
    )
      return
    suspendMutation.mutate(user.id)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return <EmptyState title="Erro ao carregar utilizadores" description="Tente novamente mais tarde." />
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
                    <td className="px-3 py-2">{formatDate(user.createdAt)}</td>
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
          <PaginationBar meta={data.meta} page={page} setPage={setPage} />
        </>
      )}
    </div>
  )
}

// CriadoresTab

function CriadoresTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

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
      return api.get(`/api/admin/breeders?${params}`).then((r) => r.data)
    },
  })

  const statusChangeMutation = useMutation({
    mutationFn: ({ breederId, status }: { breederId: number; status: string }) =>
      api.patch(`/api/admin/breeders/${breederId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

  function handleStatusChange(breeder: Breeder, newStatus: string) {
    if (newStatus === breeder.status) return
    if (
      !window.confirm(
        `Tem a certeza que pretende alterar o estado de "${breeder.businessName}" para "${statusLabel[newStatus] ?? newStatus}"?`,
      )
    )
      return
    statusChangeMutation.mutate({ breederId: breeder.id, status: newStatus })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return <EmptyState title="Erro ao carregar criadores" description="Tente novamente mais tarde." />
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
                  <th className="px-3 py-2">Alterar estado</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((breeder, i) => (
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
                    <td className="px-3 py-2">{breeder.dgavNumber || String.fromCharCode(8212)}</td>
                    <td className="px-3 py-2">{breeder.district?.namePt ?? String.fromCharCode(8212)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={statusBadgeVariant[breeder.status] ?? 'gray'}>
                        {statusLabel[breeder.status] ?? breeder.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {breeder._count.verificationDocs} / {breeder._count.reviews}
                    </td>
                    <td className="px-3 py-2">{formatDate(breeder.createdAt)}</td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                        value={breeder.status}
                        disabled={statusChangeMutation.isPending}
                        onChange={(e) => handleStatusChange(breeder, e.target.value)}
                      >
                        {breederStatusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar meta={data.meta} page={page} setPage={setPage} />
        </>
      )}
    </div>
  )
}

// AvaliacoesTab

function AvaliacoesTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery<Paginated<Review>>({
    queryKey: ['admin-flagged-reviews', page],
    queryFn: () =>
      api.get(`/api/admin/reviews/flagged?page=${page}&limit=20`).then((r) => r.data),
  })

  const moderateMutation = useMutation({
    mutationFn: ({ reviewId, status }: { reviewId: number; status: string }) =>
      api.patch(`/api/reviews/${reviewId}/moderate`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-flagged-reviews'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
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
    return <EmptyState title="Erro ao carregar avaliações" description="Tente novamente mais tarde." />
  }

  if (!data || data.data.length === 0) {
    return (
      <EmptyState
        title="Sem avaliações sinalizadas"
        description="Não existem avaliações sinalizadas para moderar."
      />
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="table-auto w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-3 py-2">Avaliação</th>
              <th className="px-3 py-2">Criador</th>
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
                key={review.id}
                className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{review.title}</div>
                  <div className="text-xs text-gray-500 max-w-xs truncate">{review.body}</div>
                </td>
                <td className="px-3 py-2">{review.breeder.businessName}</td>
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
                <td className="px-3 py-2">{formatDate(review.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={moderateMutation.isPending}
                      onClick={() =>
                        moderateMutation.mutate({ reviewId: review.id, status: 'PUBLISHED' })
                      }
                    >
                      Publicar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={moderateMutation.isPending}
                      onClick={() =>
                        moderateMutation.mutate({ reviewId: review.id, status: 'HIDDEN' })
                      }
                    >
                      Ocultar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationBar meta={data.meta} page={page} setPage={setPage} />
    </div>
  )
}

// AuditoriaTab

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
      return api.get(`/api/admin/audit-logs?${params}`).then((r) => r.data)
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
                    <td className="px-3 py-2 font-mono text-xs">{log.entityId ?? String.fromCharCode(8212)}</td>
                    <td className="px-3 py-2 text-xs">{log.ipAddress ?? String.fromCharCode(8212)}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-xs text-gray-500">
                      {log.details ? JSON.stringify(log.details) : String.fromCharCode(8212)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar meta={data.meta} page={page} setPage={setPage} />
        </>
      )}
    </div>
  )
}

// AdminPage

export function AdminPage() {
  const tabs = [
    {
      id: 'resumo',
      label: 'Resumo',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
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
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
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
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
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
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
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
      id: 'avaliacoes',
      label: 'Avaliações',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
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
      id: 'auditoria',
      label: 'Auditoria',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Painel de administração</h1>
        <p className="page-subtitle">
          Gerir utilizadores, criadores, verificações e conteúdo da plataforma.
        </p>
      </div>

      <Tabs tabs={tabs} defaultTab="resumo" />
    </div>
  )
}
