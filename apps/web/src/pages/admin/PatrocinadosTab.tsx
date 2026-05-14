// ============================================
// PataCerta — Admin Sponsored Slots Tab
// ============================================
//
// Painel para o admin gerir slots patrocinados (Fase Beta — sem
// cobrança). Permite listar/filtrar por raça, criador e estado;
// criar, editar (datas, estado, notas) e eliminar slots; ver
// contadores de impressões/cliques e CTR.

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { formatDateShort } from '../../lib/dates'
import { extractApiError } from '../../lib/errors'
import { Pagination } from '../../components/ui/Pagination'
import type { Paginated } from '../../lib/pagination'
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner, useConfirm } from '../../components/ui'

// ─── Tipos ───────────────────────────────────────────────────────────

type SlotStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED'

type SlotPaymentStatus = 'LEGACY' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

interface SponsoredSlot {
  id: number
  breederId: number
  breedId: number
  startsAt: string
  endsAt: string
  status: SlotStatus
  impressionCount: number
  clickCount: number
  notes: string | null
  createdAt: string
  updatedAt: string
  paymentStatus: SlotPaymentStatus
  priceCents: number | null
  currency: string | null
  paidAt: string | null
  stripeReceiptUrl: string | null
  breeder: {
    id: number
    businessName: string
    status: string
    district: { id: number; namePt: string } | null
  }
  breed: { id: number; nameSlug: string; namePt: string }
}

interface BreederMini {
  id: number
  businessName: string
  status: string
}

interface BreedMini {
  id: number
  namePt: string
  nameSlug: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

const statusVariant: Record<SlotStatus, 'green' | 'yellow' | 'gray'> = {
  ACTIVE: 'green',
  PAUSED: 'yellow',
  EXPIRED: 'gray',
}

const statusLabel: Record<SlotStatus, string> = {
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  EXPIRED: 'Expirado',
}

const paymentVariant: Record<SlotPaymentStatus, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  PAID: 'green',
  PENDING: 'yellow',
  FAILED: 'red',
  REFUNDED: 'gray',
  LEGACY: 'blue',
}

const paymentLabel: Record<SlotPaymentStatus, string> = {
  PAID: 'Pago',
  PENDING: 'Pendente',
  FAILED: 'Falhou',
  REFUNDED: 'Reembolsado',
  LEGACY: 'Legacy',
}

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return '—'
  const value = (cents / 100).toFixed(2)
  return `${value} ${currency ?? 'EUR'}`
}

function toDateInputValue(iso: string): string {
  // Converte ISO string para o formato YYYY-MM-DD usado por <input type="date">.
  return iso.slice(0, 10)
}

function ctr(impressions: number, clicks: number): string {
  if (impressions === 0) return '—'
  return `${((clicks / impressions) * 100).toFixed(1)}%`
}

// ─── Componente principal ────────────────────────────────────────────

export function PatrocinadosTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'' | SlotStatus>('')
  const [paymentFilter, setPaymentFilter] = useState<'' | SlotPaymentStatus>('')
  const [breedFilter, setBreedFilter] = useState<string>('')
  const [editing, setEditing] = useState<SponsoredSlot | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()

  // Listagem
  const { data, isLoading, isError } = useQuery<Paginated<SponsoredSlot>>({
    queryKey: queryKeys.admin.sponsoredSlots(
      page,
      statusFilter,
      breedFilter || null,
      paymentFilter,
    ),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (statusFilter) params.set('status', statusFilter)
      if (breedFilter) params.set('breedId', breedFilter)
      if (paymentFilter) params.set('paymentStatus', paymentFilter)
      return api.get(`/admin/sponsored-slots?${params}`).then((r) => r.data)
    },
  })

  // Listas auxiliares para filtros e selects (raças + criadores VERIFIED).
  const { data: breeds } = useQuery<BreedMini[]>({
    queryKey: queryKeys.admin.breedsMini(),
    queryFn: () => api.get('/breeds').then((r) => r.data.data ?? r.data),
  })

  const breedOptions = useMemo(
    () => [
      { value: '', label: 'Todas as raças' },
      ...(breeds ?? []).map((b) => ({ value: String(b.id), label: b.namePt })),
    ],
    [breeds],
  )

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/sponsored-slots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.sponsoredSlotsAll() })
      setDeleteError(null)
    },
    onError: (err: unknown) => {
      setDeleteError(extractApiError(err, 'Erro ao eliminar slot patrocinado.'))
    },
  })

  async function handleDelete(slot: SponsoredSlot) {
    const ok = await confirm({
      title: 'Eliminar slot patrocinado',
      message: `Eliminar slot patrocinado de "${slot.breeder.businessName}" para ${slot.breed.namePt}?`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    deleteMutation.mutate(slot.id)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return <EmptyState title="Erro ao carregar slots" description="Tente novamente mais tarde." />
  }

  return (
    <div>
      {deleteError && (
        <div
          role="alert"
          className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {deleteError}
        </div>
      )}
      {/* Filtros + acção criar */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[180px]">
            <Select
              label="Estado"
              name="statusFilter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as '' | SlotStatus)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Todos' },
                { value: 'ACTIVE', label: 'Activos' },
                { value: 'PAUSED', label: 'Pausados' },
                { value: 'EXPIRED', label: 'Expirados' },
              ]}
            />
          </div>
          <div className="min-w-[220px]">
            <Select
              label="Raça"
              name="breedFilter"
              value={breedFilter}
              onChange={(e) => {
                setBreedFilter(e.target.value)
                setPage(1)
              }}
              options={breedOptions}
            />
          </div>
          <div className="min-w-[180px]">
            <Select
              label="Pagamento"
              name="paymentFilter"
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value as '' | SlotPaymentStatus)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Todos' },
                { value: 'PAID', label: 'Pago' },
                { value: 'PENDING', label: 'Pendente' },
                { value: 'FAILED', label: 'Falhou' },
                { value: 'REFUNDED', label: 'Reembolsado' },
                { value: 'LEGACY', label: 'Legacy' },
              ]}
            />
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>+ Novo slot patrocinado</Button>
      </div>

      <p className="mb-4 text-xs text-muted">
        ◆ <span className="italic text-caramel-500">Fase beta</span> — slots geridos manualmente.
        Tracking de impressões/cliques activo; sem cobrança automática.
      </p>

      {!data || data.data.length === 0 ? (
        <EmptyState
          title="Sem slots patrocinados"
          description="Crie o primeiro slot para destacar um criador numa raça."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2">Criador</th>
                  <th className="px-3 py-2">Raça</th>
                  <th className="px-3 py-2">Janela</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Pagamento</th>
                  <th className="px-3 py-2">Impr.</th>
                  <th className="px-3 py-2">Cliques</th>
                  <th className="px-3 py-2">CTR</th>
                  <th className="px-3 py-2">Acções</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((slot, i) => (
                  <tr
                    key={slot.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      i % 2 === 1 ? 'bg-gray-50/50' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{slot.breeder.businessName}</div>
                      <div className="text-xs text-gray-500">
                        {slot.breeder.district?.namePt ?? '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2">{slot.breed.namePt}</td>
                    <td className="px-3 py-2 text-xs">
                      {formatDateShort(slot.startsAt)}
                      <br />→ {formatDateShort(slot.endsAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant[slot.status]}>{statusLabel[slot.status]}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <Badge variant={paymentVariant[slot.paymentStatus]}>
                          {paymentLabel[slot.paymentStatus]}
                        </Badge>
                        {slot.paymentStatus === 'PAID' && (
                          <span className="text-xs text-gray-500">
                            {formatPrice(slot.priceCents, slot.currency)}
                          </span>
                        )}
                        {slot.stripeReceiptUrl && (
                          <a
                            href={slot.stripeReceiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-caramel-600 hover:underline"
                          >
                            Recibo ↗
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{slot.impressionCount}</td>
                    <td className="px-3 py-2">{slot.clickCount}</td>
                    <td className="px-3 py-2">{ctr(slot.impressionCount, slot.clickCount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(slot)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={deleteMutation.isPending}
                          onClick={() => handleDelete(slot)}
                        >
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
        </>
      )}

      {/* Modal criar */}
      <Modal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="Novo slot patrocinado"
        size="lg"
      >
        <SlotForm
          mode="create"
          breeds={breeds ?? []}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false)
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.sponsoredSlotsAll() })
          }}
        />
      </Modal>

      {/* Modal editar */}
      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Editar slot — ${editing.breeder.businessName}` : 'Editar'}
        size="lg"
      >
        {editing && (
          <SlotForm
            mode="edit"
            slot={editing}
            breeds={breeds ?? []}
            onClose={() => setEditing(null)}
            onSuccess={() => {
              setEditing(null)
              queryClient.invalidateQueries({ queryKey: queryKeys.admin.sponsoredSlotsAll() })
            }}
          />
        )}
      </Modal>
      {confirmDialog}
    </div>
  )
}

// ─── Form criar/editar ───────────────────────────────────────────────

interface SlotFormCreateProps {
  mode: 'create'
  breeds: BreedMini[]
  onClose: () => void
  onSuccess: () => void
}
interface SlotFormEditProps {
  mode: 'edit'
  slot: SponsoredSlot
  breeds: BreedMini[]
  onClose: () => void
  onSuccess: () => void
}
type SlotFormProps = SlotFormCreateProps | SlotFormEditProps

function SlotForm(props: SlotFormProps) {
  const isEdit = props.mode === 'edit'
  const initialSlot = isEdit ? props.slot : null

  const [breederId, setBreederId] = useState<string>(
    initialSlot ? String(initialSlot.breederId) : '',
  )
  const [breederSearch, setBreederSearch] = useState('')
  const [breedId, setBreedId] = useState<string>(initialSlot ? String(initialSlot.breedId) : '')
  const [startsAt, setStartsAt] = useState<string>(
    initialSlot ? toDateInputValue(initialSlot.startsAt) : '',
  )
  const [endsAt, setEndsAt] = useState<string>(
    initialSlot ? toDateInputValue(initialSlot.endsAt) : '',
  )
  const [status, setStatus] = useState<SlotStatus>(initialSlot?.status ?? 'ACTIVE')
  const [notes, setNotes] = useState<string>(initialSlot?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  // Pesquisa de criadores VERIFIED para o select de criar.
  const { data: breeders } = useQuery<{ data: BreederMini[] }>({
    queryKey: queryKeys.admin.breedersVerified(breederSearch),
    queryFn: () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '50',
        status: 'VERIFIED',
      })
      if (breederSearch.trim()) params.set('q', breederSearch.trim())
      return api.get(`/admin/breeders?${params}`).then((r) => r.data)
    },
    enabled: !isEdit,
  })

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/admin/sponsored-slots', body).then((r) => r.data),
    onSuccess: () => props.onSuccess(),
    onError: (err: unknown) => {
      setError(extractApiError(err, 'Erro ao criar slot'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/admin/sponsored-slots/${initialSlot!.id}`, body).then((r) => r.data),
    onSuccess: () => props.onSuccess(),
    onError: (err: unknown) => {
      setError(extractApiError(err, 'Erro ao actualizar slot'))
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!startsAt || !endsAt) {
      setError('Indique a data de início e fim')
      return
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setError('A data de fim tem de ser posterior à data de início')
      return
    }

    if (isEdit) {
      updateMutation.mutate({
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        status,
        notes: notes.trim() || null,
      })
    } else {
      if (!breederId || !breedId) {
        setError('Seleccione criador e raça')
        return
      }
      createMutation.mutate({
        breederId: Number(breederId),
        breedId: Number(breedId),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isEdit && (
        <>
          <div>
            <label className="label">Pesquisar criador (verificado)</label>
            <Input
              value={breederSearch}
              onChange={(e) => setBreederSearch(e.target.value)}
              placeholder="Nome comercial…"
            />
          </div>
          <div>
            <label className="label">Criador</label>
            <select
              className="input"
              value={breederId}
              onChange={(e) => setBreederId(e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {(breeders?.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.businessName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Raça</label>
            <select className="input" value={breedId} onChange={(e) => setBreedId(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {props.breeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.namePt}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {isEdit && (
        <Card>
          <p className="text-xs text-muted">Criador</p>
          <p className="font-medium text-ink">{initialSlot!.breeder.businessName}</p>
          <p className="mt-2 text-xs text-muted">Raça</p>
          <p className="font-medium text-ink">{initialSlot!.breed.namePt}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Início</label>
          <input
            type="date"
            className="input"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Fim</label>
          <input
            type="date"
            className="input"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        </div>
      </div>

      {isEdit && (
        <div>
          <label className="label">Estado</label>
          <Select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SlotStatus)}
            options={[
              { value: 'ACTIVE', label: 'Activo' },
              { value: 'PAUSED', label: 'Pausado' },
              { value: 'EXPIRED', label: 'Expirado' },
            ]}
          />
        </div>
      )}

      <div>
        <label className="label">Notas internas (opcional)</label>
        <textarea
          className="input min-h-[60px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="ex.: contrato verbal, primeiro patrocinador beta…"
        />
        <p className="mt-1 text-xs text-gray-400">{notes.length}/500</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={props.onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={isPending}>
          {isEdit ? 'Guardar' : 'Criar slot'}
        </Button>
      </div>
    </form>
  )
}
