import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDateShort } from '../../../lib/dates'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Badge, Button, Spinner, EmptyState, Select, Modal } from '../../../components/ui'
import { type User, statusBadgeVariant, roleBadgeVariant, statusLabel, roleLabel } from '../_shared'

export function UtilizadoresTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState('')
  const [suspendingUser, setSuspendingUser] = useState<User | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<Paginated<User>>({
    queryKey: queryKeys.admin.users(page, roleFilter || undefined),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
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
          {/* Mobile: lista de cards. Tabela em <md> ficava cortada/scrollavel
              sem indicacao visual; cards garantem que toda a info e accoes
              ficam acessiveis em 360-430px. */}
          <ul className="space-y-3 md:hidden">
            {data.data.map((user) => (
              <li key={user.id} className="rounded-lg border border-line bg-surface p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="truncate text-sm text-muted">{user.email}</p>
                  </div>
                  <Badge variant={roleBadgeVariant[user.role] ?? 'gray'}>
                    {roleLabel[user.role] ?? user.role}
                  </Badge>
                </div>
                <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">Criador</dt>
                  <dd>
                    {user.breeder ? (
                      <Badge variant={statusBadgeVariant[user.breeder.status] ?? 'gray'}>
                        {statusLabel[user.breeder.status] ?? user.breeder.status}
                      </Badge>
                    ) : (
                      <span className="text-subtle">{String.fromCharCode(8212)}</span>
                    )}
                  </dd>
                  <dt className="text-muted">Registado</dt>
                  <dd className="text-ink">{formatDateShort(user.createdAt)}</dd>
                </dl>
                <div className="flex justify-end">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={suspendMutation.isPending}
                    onClick={() => handleSuspend(user)}
                  >
                    Suspender
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela tradicional */}
          <div className="hidden md:block md:overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
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
                    className={`border-b border-line/60 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
                  >
                    <td className="px-3 py-2 font-medium text-ink">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-3 py-2 text-ink">{user.email}</td>
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
                        <span className="text-subtle">{String.fromCharCode(8212)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink">{formatDateShort(user.createdAt)}</td>
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
          <p className="text-sm text-muted">
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
            <p className="mt-1 text-xs text-subtle">{suspendReason.length}/500</p>
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
