import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { formatDateShort } from '../../lib/dates'
import { Badge, Button, EmptyState, Modal, Spinner, useConfirm } from '../../components/ui'
import { usePageMeta } from '../../hooks/usePageMeta'
import {
  statusBadgeVariant,
  statusLabel,
  roleBadgeVariant,
  roleLabel,
} from './_shared'

/**
 * AdminUserDetailPage — visao 360 de um utilizador para o admin.
 *
 * Espelha o padrao de `AdminBreederDetailPage`: header com accoes
 * principais (Suspender / Reactivar), bloco de suspensao quando
 * aplicavel, sec\u00e7oes em grid 2-col com perfil/criador/contagens,
 * lista de servicos publicados, denuncias feitas/recebidas e
 * historico de auditoria do utilizador.
 *
 * Tipos definidos localmente — o endpoint /admin/users/:id e' usado
 * apenas aqui.
 */

interface UserDetailPayload {
  user: UserDetailUser
  auditLogs: UserAuditLog[]
  reportsFiled: {
    messages: MessageReportFiled[]
    services: ServiceReportFiled[]
  }
  reportsReceived: {
    services: ServiceReportReceived[]
  }
}

interface UserDetailUser {
  id: number
  email: string
  firstName: string
  lastName: string
  role: string
  phone: string | null
  avatarUrl: string | null
  isActive: boolean
  suspendedAt: string | null
  suspendedReason: string | null
  emailVerified: boolean
  createdAt: string
  updatedAt: string
  breeder: {
    id: number
    businessName: string
    slug: string
    nif: string
    dgavNumber: string | null
    status: string
    verifiedAt: string | null
    suspendedAt: string | null
    suspendedReason: string | null
    avgRating: number | null
    reviewCount: number
    featuredUntil: string | null
    createdAt: string
  } | null
  services: Array<{
    id: number
    title: string
    slug: string | null
    status: string
    priceCents: number
    priceUnit: string
    currency: string
    avgRating: number | null
    reviewCount: number
    createdAt: string
    publishedAt: string | null
    removedAt: string | null
    removedReason: string | null
    featuredUntil: string | null
  }>
  _count: {
    sentMessages: number
    threadsAsOwner: number
    reviews: number
    serviceReviews: number
    messageReportsFiled: number
    serviceReportsFiled: number
    refreshTokens: number
    auditLogs: number
  }
}

interface UserAuditLog {
  id: number
  action: string
  entity: string
  entityId: number | string | null
  details: unknown
  ipAddress: string | null
  createdAt: string
  user: { id: number; firstName: string; lastName: string; email: string } | null
}

interface MessageReportFiled {
  id: number
  reason: string
  status: string
  createdAt: string
  reviewedAt: string | null
  message: {
    id: number
    sender: { id: number; firstName: string; lastName: string; email: string } | null
  } | null
}

interface ServiceReportFiled {
  id: number
  reason: string
  status: string
  createdAt: string
  reviewedAt: string | null
  service: { id: number; title: string; slug: string | null } | null
}

interface ServiceReportReceived {
  id: number
  reason: string
  status: string
  createdAt: string
  reviewedAt: string | null
  reporter: { id: number; firstName: string; lastName: string; email: string }
  service: { id: number; title: string; slug: string | null } | null
}

const reportStatusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  RESOLVED: 'Resolvida',
  DISMISSED: 'Descartada',
}
const reportStatusVariant: Record<string, 'yellow' | 'green' | 'gray'> = {
  PENDING: 'yellow',
  RESOLVED: 'green',
  DISMISSED: 'gray',
}

function formatPrice(cents: number, currency: string, unit: string) {
  const value = (cents / 100).toLocaleString('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
  })
  return `${value} / ${unit}`
}

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const userId = id ? Number(id) : NaN
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [suspendOpen, setSuspendOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()

  async function handleReactivate() {
    const ok = await confirm({
      title: 'Reactivar conta',
      message: 'Tem a certeza que pretende reactivar esta conta?',
      confirmLabel: 'Reactivar',
    })
    if (!ok) return
    setActionError(null)
    unsuspendMutation.mutate()
  }

  usePageMeta({
    title: `Utilizador #${userId} — Administração`,
    canonicalPath: `/admin/utilizadores/${userId}`,
    noIndex: true,
  })

  const { data, isLoading, isError, error } = useQuery<UserDetailPayload>({
    queryKey: queryKeys.admin.userDetail(userId),
    queryFn: () => api.get(`/admin/users/${userId}`).then((r) => r.data),
    enabled: !Number.isNaN(userId),
  })

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.userDetail(userId) })
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCounts() })
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
  }

  const suspendMutation = useMutation({
    mutationFn: (reason: string) =>
      api.patch(`/admin/users/${userId}/suspend`, { reason }),
    onSuccess: () => {
      setSuspendOpen(false)
      setSuspendReason('')
      setActionError(null)
      invalidateAfterMutation()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } }; message?: string })
          ?.response?.data?.error ||
        (err as { response?: { data?: { error?: string; message?: string } }; message?: string })
          ?.response?.data?.message ||
        (err as Error)?.message ||
        'Falha ao suspender utilizador'
      setActionError(msg)
    },
  })

  const unsuspendMutation = useMutation({
    mutationFn: () => api.patch(`/admin/users/${userId}/unsuspend`),
    onSuccess: () => {
      setActionError(null)
      invalidateAfterMutation()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } }; message?: string })
          ?.response?.data?.error ||
        (err as { response?: { data?: { error?: string; message?: string } }; message?: string })
          ?.response?.data?.message ||
        (err as Error)?.message ||
        'Falha ao reactivar utilizador'
      setActionError(msg)
    },
  })

  if (Number.isNaN(userId)) {
    return (
      <div className="page-container">
        <EmptyState title="ID inválido" description="O identificador do utilizador é inválido." />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    const status = (error as { response?: { status?: number } })?.response?.status
    return (
      <div className="page-container">
        <EmptyState
          title={status === 404 ? 'Utilizador não encontrado' : 'Erro ao carregar utilizador'}
          description={
            status === 404
              ? 'O utilizador não existe ou foi removido.'
              : 'Não foi possível obter os dados deste utilizador. Tente novamente.'
          }
        />
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => navigate('/admin?tab=utilizadores')}>
            ← Voltar à lista
          </Button>
        </div>
      </div>
    )
  }

  const { user, auditLogs, reportsFiled, reportsReceived } = data
  const isSuspended = !user.isActive
  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.email

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          to="/admin?tab=utilizadores"
          className="text-sm text-caramel-700 underline-offset-2 hover:underline"
        >
          ← Utilizadores
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="page-title">{fullName}</h1>
          <p className="page-subtitle">{user.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={roleBadgeVariant[user.role] ?? 'gray'}>
              {roleLabel[user.role] ?? user.role}
            </Badge>
            {isSuspended ? (
              <Badge variant="red">Suspenso</Badge>
            ) : (
              <Badge variant="green">Activo</Badge>
            )}
            {user.emailVerified ? (
              <Badge variant="green">Email verificado</Badge>
            ) : (
              <Badge variant="yellow">Email por verificar</Badge>
            )}
            <span className="text-xs text-muted">
              ID #{user.id} · Registado em {formatDateShort(user.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuspended ? (
            <Button
              variant="primary"
              loading={unsuspendMutation.isPending}
              onClick={handleReactivate}
            >
              Reactivar conta
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={user.role === 'ADMIN'}
              title={
                user.role === 'ADMIN'
                  ? 'Não é possível suspender outro administrador. Remova primeiro o papel ADMIN.'
                  : undefined
              }
              onClick={() => {
                setSuspendReason('')
                setActionError(null)
                setSuspendOpen(true)
              }}
            >
              Suspender conta
            </Button>
          )}
        </div>
      </div>

      {/* Suspension banner */}
      {isSuspended && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            Conta suspensa{user.suspendedAt ? ` em ${formatDateShort(user.suspendedAt)}` : ''}
          </p>
          {user.suspendedReason && (
            <p className="mt-1 text-sm text-red-800">{user.suspendedReason}</p>
          )}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {actionError}
        </div>
      )}

      {/* Grid 2-col com sec\u00e7\u00f5es */}
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Conta">
          <Field label="Nome" value={fullName} />
          <Field label="Email" value={user.email} />
          <Field label="Telefone" value={user.phone ?? '—'} />
          <Field label="Papel" value={roleLabel[user.role] ?? user.role} />
          <Field label="Estado" value={isSuspended ? 'Suspensa' : 'Activa'} />
          <Field
            label="Email verificado"
            value={user.emailVerified ? 'Sim' : 'Não'}
          />
          <Field label="Criada em" value={formatDateShort(user.createdAt)} />
          <Field label="Actualizada em" value={formatDateShort(user.updatedAt)} />
        </SectionCard>

        <SectionCard title="Actividade">
          <Field
            label="Mensagens enviadas"
            value={String(user._count.sentMessages)}
          />
          <Field
            label="Conversas iniciadas"
            value={String(user._count.threadsAsOwner)}
          />
          <Field
            label="Avaliações de criadores"
            value={String(user._count.reviews)}
          />
          <Field
            label="Avaliações de serviços"
            value={String(user._count.serviceReviews)}
          />
          <Field
            label="Denúncias de mensagens"
            value={String(user._count.messageReportsFiled)}
          />
          <Field
            label="Denúncias de serviços"
            value={String(user._count.serviceReportsFiled)}
          />
          <Field
            label="Sessões activas (refresh tokens)"
            value={String(user._count.refreshTokens)}
          />
          <Field
            label="Acções de auditoria como actor"
            value={String(user._count.auditLogs)}
          />
        </SectionCard>

        {user.breeder && (
          <SectionCard title="Perfil de criador" className="md:col-span-2">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Link
                to={`/admin/criadores/${user.breeder.id}`}
                className="text-sm font-medium text-caramel-700 underline-offset-2 hover:underline"
              >
                {user.breeder.businessName} ↗
              </Link>
              <Badge variant={statusBadgeVariant[user.breeder.status] ?? 'gray'}>
                {statusLabel[user.breeder.status] ?? user.breeder.status}
              </Badge>
            </div>
            <div className="grid gap-1 md:grid-cols-2">
              <Field label="NIF" value={user.breeder.nif} />
              <Field label="DGAV" value={user.breeder.dgavNumber ?? '—'} />
              <Field
                label="Verificado em"
                value={user.breeder.verifiedAt ? formatDateShort(user.breeder.verifiedAt) : '—'}
              />
              <Field
                label="Avaliação média"
                value={
                  user.breeder.avgRating !== null
                    ? `${user.breeder.avgRating.toFixed(2)} (${user.breeder.reviewCount})`
                    : '—'
                }
              />
              <Field
                label="Destaque até"
                value={
                  user.breeder.featuredUntil ? formatDateShort(user.breeder.featuredUntil) : '—'
                }
              />
              <Field label="Criado em" value={formatDateShort(user.breeder.createdAt)} />
            </div>
            {user.breeder.suspendedReason && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <strong>Motivo de suspensão do criador:</strong> {user.breeder.suspendedReason}
              </p>
            )}
          </SectionCard>
        )}

        <SectionCard
          title={`Serviços publicados (${user.services.length})`}
          className="md:col-span-2"
        >
          {user.services.length === 0 ? (
            <p className="text-sm text-muted">Sem serviços publicados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="px-2 py-1.5">Título</th>
                    <th className="px-2 py-1.5">Estado</th>
                    <th className="px-2 py-1.5">Preço</th>
                    <th className="px-2 py-1.5">Avaliação</th>
                    <th className="px-2 py-1.5">Criado</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {user.services.map((s) => (
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="px-2 py-1.5 text-ink">{s.title}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant={statusBadgeVariant[s.status] ?? 'gray'}>
                          {statusLabel[s.status] ?? s.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-ink">
                        {formatPrice(s.priceCents, s.currency, s.priceUnit)}
                      </td>
                      <td className="px-2 py-1.5 text-ink">
                        {s.avgRating !== null
                          ? `${s.avgRating.toFixed(2)} (${s.reviewCount})`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-muted">{formatDateShort(s.createdAt)}</td>
                      <td className="px-2 py-1.5">
                        <a
                          href={`/servicos/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-caramel-700 underline-offset-2 hover:underline"
                        >
                          Ver ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={`Denúncias feitas (${reportsFiled.messages.length + reportsFiled.services.length})`}
        >
          {reportsFiled.messages.length === 0 && reportsFiled.services.length === 0 ? (
            <p className="text-sm text-muted">Não submeteu denúncias.</p>
          ) : (
            <ul className="space-y-2">
              {reportsFiled.messages.map((r) => (
                <li
                  key={`m-${r.id}`}
                  className="rounded border border-line bg-surface-alt/40 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-muted">Mensagem #{r.message?.id ?? '?'}</span>
                    <Badge variant={reportStatusVariant[r.status] ?? 'gray'}>
                      {reportStatusLabel[r.status] ?? r.status}
                    </Badge>
                  </div>
                  <p className="text-ink">{r.reason}</p>
                  <p className="mt-1 text-muted">{formatDateShort(r.createdAt)}</p>
                </li>
              ))}
              {reportsFiled.services.map((r) => (
                <li
                  key={`s-${r.id}`}
                  className="rounded border border-line bg-surface-alt/40 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-muted">Serviço {r.service?.title ?? '?'}</span>
                    <Badge variant={reportStatusVariant[r.status] ?? 'gray'}>
                      {reportStatusLabel[r.status] ?? r.status}
                    </Badge>
                  </div>
                  <p className="text-ink">{r.reason}</p>
                  <p className="mt-1 text-muted">{formatDateShort(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Denúncias recebidas (${reportsReceived.services.length})`}>
          {reportsReceived.services.length === 0 ? (
            <p className="text-sm text-muted">Sem denúncias recebidas em serviços.</p>
          ) : (
            <ul className="space-y-2">
              {reportsReceived.services.map((r) => (
                <li
                  key={`r-${r.id}`}
                  className="rounded border border-line bg-surface-alt/40 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-muted">{r.service?.title ?? '?'}</span>
                    <Badge variant={reportStatusVariant[r.status] ?? 'gray'}>
                      {reportStatusLabel[r.status] ?? r.status}
                    </Badge>
                  </div>
                  <p className="text-ink">{r.reason}</p>
                  <p className="mt-1 text-muted">
                    Por {r.reporter.firstName} {r.reporter.lastName} ·{' '}
                    {formatDateShort(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={`Histórico de auditoria (${auditLogs.length})`}
          className="md:col-span-2"
        >
          {auditLogs.length === 0 ? (
            <p className="text-sm text-muted">Sem registos de auditoria sobre este utilizador.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="px-2 py-1.5">Data</th>
                    <th className="px-2 py-1.5">Acção</th>
                    <th className="px-2 py-1.5">Por</th>
                    <th className="px-2 py-1.5">IP</th>
                    <th className="px-2 py-1.5">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-line/60">
                      <td className="px-2 py-1.5 text-ink whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('pt-PT')}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge variant="blue">{log.action}</Badge>
                      </td>
                      <td className="px-2 py-1.5 text-ink">
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Sistema'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted">
                        {log.ipAddress ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted">
                        {log.details ? (
                          <span className="line-clamp-2 break-words">
                            {typeof log.details === 'string'
                              ? log.details
                              : JSON.stringify(log.details)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Modal de suspensao */}
      <Modal
        isOpen={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title="Suspender utilizador"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Vai suspender <strong>{fullName}</strong>. O utilizador deixa de poder iniciar sessão.
            Indique um motivo (mínimo 15 caracteres).
          </p>
          <textarea
            className="input min-h-[100px]"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            maxLength={500}
            placeholder="Motivo da suspensão"
            aria-label="Motivo da suspensão"
          />
          <p className="text-xs text-muted text-right">{suspendReason.length}/500</p>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSuspendOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={suspendReason.trim().length < 15}
              loading={suspendMutation.isPending}
              onClick={() => suspendMutation.mutate(suspendReason.trim())}
            >
              Suspender
            </Button>
          </div>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  )
}

function SectionCard({
  title,
  children,
  className = '',
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-4 shadow-sm ${className}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-caps text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-2 py-1 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink break-words">{value}</dd>
    </div>
  )
}
