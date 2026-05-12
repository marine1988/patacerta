import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { formatDateShort } from '../../lib/dates'
import { Badge, Button, EmptyState, Modal, Spinner } from '../../components/ui'
import { usePageMeta } from '../../hooks/usePageMeta'
import { statusBadgeVariant, statusLabel } from './_shared'

// DocumentViewer puxa pdf.js (~400KB gzipped). Lazy para nao penalizar
// quem nunca abre a pagina de detalhe (e mesmo aqui so renderiza quando
// um doc esta a ser visualizado).
const DocumentViewer = lazy(() =>
  import('../../components/ui/DocumentViewer').then((m) => ({ default: m.DocumentViewer })),
)

// ─────────────────────────────────────────────────────────────────────
// Tipos do payload de GET /admin/breeders/:id
// (definidos localmente — endpoint exclusivo desta pagina; se for
// reutilizado noutro lado, mover para _shared.ts)
// ─────────────────────────────────────────────────────────────────────

interface BreederDetailUser {
  id: number
  firstName: string
  lastName: string
  email: string
  phone: string | null
  role: string
  isActive: boolean
  emailVerified: boolean
  createdAt: string
}

interface BreederDetailVerificationDoc {
  id: number
  docType: string
  fileName: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  notes: string | null
  createdAt: string
  reviewedAt: string | null
  reviewer: { id: number; firstName: string; lastName: string; email: string } | null
}

interface BreederDetailSpecies {
  species: { id: number; nameSlug: string; namePt: string }
}

interface BreederDetailBreed {
  breed: { id: number; nameSlug: string; namePt: string }
}

interface BreederDetail {
  id: number
  businessName: string
  nif: string
  dgavNumber: string | null
  status: string
  bio: string | null
  websiteUrl: string | null
  instagramHandle: string | null
  facebookUrl: string | null
  phonePublic: string | null
  emailPublic: string | null
  addressLine: string | null
  postalCode: string | null
  featuredUntil: string | null
  suspendedAt: string | null
  suspendedReason: string | null
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
  user: BreederDetailUser
  district: { id: number; namePt: string; code: string } | null
  municipality: { id: number; namePt: string; code: string } | null
  species: BreederDetailSpecies[]
  breeds: BreederDetailBreed[]
  verificationDocs: BreederDetailVerificationDoc[]
  _count: { reviews: number; photos: number; threadsAsBreeder: number; breeds: number }
}

interface DocViewResponse {
  url: string
  fileName: string
  docType?: string
}

// Variantes de badge para status de doc — distinto do badge de breeder
// (verde = aprovado, vermelho = rejeitado, amarelo = pendente).
const docStatusBadge: Record<string, 'green' | 'yellow' | 'red'> = {
  APPROVED: 'green',
  PENDING: 'yellow',
  REJECTED: 'red',
}

const docStatusLabel: Record<string, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Pendente',
  REJECTED: 'Rejeitado',
}

export function AdminBreederDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const breederId = id ? Number(id) : NaN

  // Estado UI: qual doc esta expandido para visualizacao, e estado do
  // modal de rejeicao (notes obrigatorias).
  const [viewingDocId, setViewingDocId] = useState<number | null>(null)
  const [rejectingDocId, setRejectingDocId] = useState<number | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  // Modal de suspensao (motivo obrigatorio, min 15 chars).
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')

  usePageMeta({
    title: 'Detalhe de criador',
    canonicalPath: `/admin/criadores/${id ?? ''}`,
    noIndex: true,
  })

  const {
    data: breeder,
    isLoading,
    isError,
    error,
  } = useQuery<BreederDetail>({
    queryKey: queryKeys.admin.breederDetail(breederId),
    queryFn: () => api.get(`/admin/breeders/${breederId}`).then((r) => r.data),
    enabled: !isNaN(breederId),
  })

  // Presigned URL do doc activo. So' faz fetch quando viewingDocId muda,
  // e o resultado expira (URLs S3 presigned validas tipicamente 5-15min).
  // Re-fetch on focus desactivado para evitar abrir multiplas chamadas
  // a S3 sem necessidade — o admin abre o doc e revisa.
  const { data: docView, isLoading: isDocLoading } = useQuery<DocViewResponse>({
    queryKey: ['admin-doc-view', viewingDocId],
    queryFn: () => api.get(`/verification/${viewingDocId}/view`).then((r) => r.data),
    enabled: viewingDocId !== null,
    staleTime: 5 * 60 * 1000, // URLs presigned sao validas ~15min
    refetchOnWindowFocus: false,
  })

  // Aprovar = aprovar o documento DGAV. Backend promove o criador a
  // VERIFIED automaticamente quando aplicavel.
  const approveMutation = useMutation({
    mutationFn: (docId: number) =>
      api.patch(`/verification/${docId}/review`, { status: 'APPROVED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.breederDetail(breederId) })
      queryClient.invalidateQueries({ queryKey: ['admin-verifications'] })
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCounts() })
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao aprovar documento.')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ docId, notes }: { docId: number; notes: string }) =>
      api.patch(`/verification/${docId}/review`, { status: 'REJECTED', notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.breederDetail(breederId) })
      queryClient.invalidateQueries({ queryKey: ['admin-verifications'] })
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCounts() })
      setRejectingDocId(null)
      setRejectNotes('')
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao rejeitar documento.')
    },
  })

  // Suspender / Reactivar criador. Reusa endpoints existentes.
  // Backend: ao reactivar, status volta para VERIFIED se houver DGAV
  // APPROVED, caso contrario para DRAFT (ver admin.controller.unsuspendBreeder).
  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.patch(`/admin/breeders/${id}/suspend`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.breederDetail(breederId) })
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
      setSuspendOpen(false)
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
    mutationFn: (id: number) => api.patch(`/admin/breeders/${id}/unsuspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.breederDetail(breederId) })
      queryClient.invalidateQueries({ queryKey: ['admin-breeders'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
      setActionError(null)
    },
    onError: (err: unknown) => {
      const maybeMsg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data
      setActionError(maybeMsg?.error ?? maybeMsg?.message ?? 'Erro ao reactivar criador.')
    },
  })

  function handleApprove(doc: BreederDetailVerificationDoc) {
    if (
      !window.confirm(
        `Aprovar o documento "${doc.fileName}"? Se for o cartão DGAV, o criador será promovido automaticamente a Verificado.`,
      )
    )
      return
    approveMutation.mutate(doc.id)
  }

  function openReject(docId: number) {
    setRejectingDocId(docId)
    setRejectNotes('')
    setActionError(null)
  }

  function confirmReject() {
    if (rejectingDocId === null) return
    if (rejectNotes.trim().length < 5) {
      setActionError('Indique um motivo para a rejeição (pelo menos 5 caracteres).')
      return
    }
    rejectMutation.mutate({ docId: rejectingDocId, notes: rejectNotes.trim() })
  }

  if (isNaN(breederId)) {
    return (
      <div className="page-container">
        <EmptyState title="ID inválido" description="O identificador do criador não é válido." />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="page-container flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !breeder) {
    const status = (error as { response?: { status?: number } } | undefined)?.response?.status
    return (
      <div className="page-container">
        <EmptyState
          title={status === 404 ? 'Criador não encontrado' : 'Erro ao carregar criador'}
          description={
            status === 404
              ? 'Pode ter sido removido ou o link está errado.'
              : 'Tente novamente mais tarde.'
          }
        />
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => navigate('/admin?tab=criadores')}>
            ← Voltar a Criadores
          </Button>
        </div>
      </div>
    )
  }

  const ownerName = `${breeder.user.firstName} ${breeder.user.lastName}`

  return (
    <div className="page-container">
      {/* Breadcrumb / voltar */}
      <div className="mb-4">
        <Link
          to="/admin?tab=criadores"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← Voltar a Criadores
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{breeder.businessName}</h1>
          <p className="page-subtitle">
            {ownerName} {String.fromCharCode(8212)} {breeder.user.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={statusBadgeVariant[breeder.status] ?? 'gray'}>
            {statusLabel[breeder.status] ?? breeder.status}
          </Badge>
          {breeder.status === 'SUSPENDED' ? (
            <Button
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    `Reactivar "${breeder.businessName}"? Volta ao estado anterior (Verificado se já tinha DGAV aprovado, caso contrário Rascunho).`,
                  )
                ) {
                  unsuspendMutation.mutate(breeder.id)
                }
              }}
              disabled={unsuspendMutation.isPending}
            >
              Reactivar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setSuspendReason('')
                setActionError(null)
                setSuspendOpen(true)
              }}
              disabled={suspendMutation.isPending}
            >
              Suspender
            </Button>
          )}
        </div>
      </div>

      {/* Aviso de suspensao em destaque */}
      {breeder.status === 'SUSPENDED' && breeder.suspendedReason && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Criador suspenso</p>
          <p className="mt-1">{breeder.suspendedReason}</p>
          {breeder.suspendedAt && (
            <p className="mt-1 text-xs text-red-700/80">
              Em {formatDateShort(breeder.suspendedAt)}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna esquerda: dados do criador */}
        <div className="space-y-4 lg:col-span-1">
          <SectionCard title="Dono da conta">
            <Field label="Nome" value={ownerName} />
            <Field label="Email" value={breeder.user.email} />
            <Field label="Telefone" value={breeder.user.phone ?? '—'} />
            <Field label="Papel" value={breeder.user.role} />
            <Field label="Conta activa" value={breeder.user.isActive ? 'Sim' : 'Não'} />
            <Field label="Email verificado" value={breeder.user.emailVerified ? 'Sim' : 'Não'} />
            <Field label="Registado em" value={formatDateShort(breeder.user.createdAt)} />
          </SectionCard>

          <SectionCard title="Identificação">
            <Field label="NIF" value={breeder.nif} />
            <Field label="DGAV" value={breeder.dgavNumber ?? '—'} />
            {breeder.verifiedAt && (
              <Field label="Verificado em" value={formatDateShort(breeder.verifiedAt)} />
            )}
          </SectionCard>

          <SectionCard title="Localização">
            <Field label="Distrito" value={breeder.district?.namePt ?? '—'} />
            <Field label="Concelho" value={breeder.municipality?.namePt ?? '—'} />
            <Field label="Morada" value={breeder.addressLine ?? '—'} />
            <Field label="Código postal" value={breeder.postalCode ?? '—'} />
          </SectionCard>

          <SectionCard title="Contactos públicos">
            <Field label="Telefone" value={breeder.phonePublic ?? '—'} />
            <Field label="Email" value={breeder.emailPublic ?? '—'} />
            <Field label="Website" value={breeder.websiteUrl ?? '—'} />
            <Field label="Instagram" value={breeder.instagramHandle ?? '—'} />
            <Field label="Facebook" value={breeder.facebookUrl ?? '—'} />
          </SectionCard>

          <SectionCard title="Espécies e raças autorizadas">
            {breeder.species.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma espécie associada.</p>
            ) : (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {breeder.species.map((s) => (
                  <Badge key={s.species.id} variant="blue">
                    {s.species.namePt}
                  </Badge>
                ))}
              </div>
            )}
            {breeder.breeds.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma raça autorizada.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {breeder.breeds.map((b) => (
                  <Badge key={b.breed.id} variant="gray">
                    {b.breed.namePt}
                  </Badge>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Estatísticas">
            <Field label="Avaliações" value={String(breeder._count.reviews)} />
            <Field label="Fotos" value={String(breeder._count.photos)} />
            <Field label="Conversas" value={String(breeder._count.threadsAsBreeder)} />
            <Field label="Raças" value={String(breeder._count.breeds)} />
          </SectionCard>
        </div>

        {/* Coluna direita: documentos de verificacao */}
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Documentos de verificação">
            {breeder.verificationDocs.length === 0 ? (
              <EmptyState
                title="Sem documentos"
                description="Este criador ainda não enviou nenhum documento de verificação."
              />
            ) : (
              <ul className="space-y-4">
                {breeder.verificationDocs.map((doc) => {
                  const isViewing = viewingDocId === doc.id
                  const isPending = doc.status === 'PENDING'
                  return (
                    <li key={doc.id} className="rounded-lg border border-line bg-surface p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{doc.fileName}</p>
                          <p className="text-xs text-muted">
                            Tipo: {doc.docType} · Enviado em {formatDateShort(doc.createdAt)}
                          </p>
                          {doc.reviewedAt && doc.reviewer && (
                            <p className="mt-0.5 text-xs text-muted">
                              Revisto em {formatDateShort(doc.reviewedAt)} por{' '}
                              {doc.reviewer.firstName} {doc.reviewer.lastName}
                            </p>
                          )}
                          {doc.notes && (
                            <p className="mt-1 text-xs text-muted">
                              <span className="font-medium">Notas:</span> {doc.notes}
                            </p>
                          )}
                        </div>
                        <Badge variant={docStatusBadge[doc.status] ?? 'gray'}>
                          {docStatusLabel[doc.status] ?? doc.status}
                        </Badge>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setViewingDocId(isViewing ? null : doc.id)}
                        >
                          {isViewing ? 'Esconder pré-visualização' : 'Ver documento'}
                        </Button>
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(doc)}
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
                          </>
                        )}
                      </div>

                      {isViewing && (
                        <div className="mt-3">
                          {isDocLoading || !docView ? (
                            <div className="flex justify-center py-8">
                              <Spinner />
                            </div>
                          ) : (
                            <Suspense
                              fallback={
                                <div className="flex justify-center py-8">
                                  <Spinner />
                                </div>
                              }
                            >
                              <DocumentViewer
                                url={docView.url}
                                fileName={docView.fileName || doc.fileName}
                              />
                            </Suspense>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>

          {breeder.bio && (
            <SectionCard title="Bio pública">
              <p className="whitespace-pre-wrap text-sm text-ink">{breeder.bio}</p>
            </SectionCard>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {/* Modal de suspensao */}
      <Modal
        isOpen={suspendOpen}
        onClose={() => {
          setSuspendOpen(false)
          setActionError(null)
        }}
        title="Suspender criador"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink">
            O perfil deixará de aparecer em pesquisas e listas. O motivo é registado no histórico
            de auditoria.
          </p>
          <textarea
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Motivo da suspensão (mín. 15 caracteres)"
            className="w-full min-h-[100px] border border-line bg-surface p-3 text-sm text-ink"
            style={{ borderRadius: 2 }}
            minLength={15}
            maxLength={500}
          />
          <p className="text-xs text-subtle">{suspendReason.length}/500 (mín. 15)</p>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSuspendOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={suspendMutation.isPending}
              disabled={suspendReason.trim().length < 15}
              onClick={() =>
                suspendMutation.mutate({ id: breeder.id, reason: suspendReason.trim() })
              }
            >
              Suspender
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de rejeicao */}
      <Modal
        isOpen={rejectingDocId !== null}
        onClose={() => {
          setRejectingDocId(null)
          setActionError(null)
        }}
        title="Rejeitar documento"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Indique o motivo da rejeição. Se for o cartão DGAV, o criador volta ao estado{' '}
            <strong>Rascunho</strong> para poder enviar um novo certificado.
          </p>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Ex.: certificado ilegível, fora do prazo, NIF não corresponde, etc."
            className="w-full min-h-[100px] border border-line bg-surface p-3 text-sm text-ink"
            style={{ borderRadius: 2 }}
            minLength={5}
            maxLength={500}
          />
          <p className="text-xs text-subtle">{rejectNotes.length}/500 (mín. 5)</p>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectingDocId(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmReject}
              loading={rejectMutation.isPending}
              disabled={rejectNotes.trim().length < 5}
            >
              Rejeitar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Pequenos helpers locais — nao justificam ficheiros separados
// ─────────────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="space-y-1.5 text-sm">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-3">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </div>
  )
}
