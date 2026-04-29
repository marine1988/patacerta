// ============================================
// PataCerta — ServicesTab (Dashboard)
// ============================================
//
// Tab "Serviços" no Painel: gestão dos próprios anúncios
// (passeios + pet-sitting + treino) com:
//   - Lista filtrável por estado (tabs)
//   - Form de criação/edição em secções colapsáveis
//   - Drag-and-drop + botões para reordenar fotos
//   - Preview do cartão como aparece no diretório
//   - Contadores de caracteres + badge "Capa" na primeira foto
//
// Extraído do DashboardPage.tsx para reduzir o tamanho do ficheiro
// e manter o componente focado.

import { useState, useEffect, useRef, useMemo, type FormEvent, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createServiceSchema } from '@patacerta/shared'
import { extractApiError } from '../../lib/errors'
import { formatPrice, parsePriceToCents, type ServicePriceUnit } from '../../lib/format'
import {
  type ServiceBase,
  type ServiceCategory,
  type ServicePhoto,
  type ServiceStatusValue,
} from '../../lib/services'
import { api } from '../../lib/api'
import { formatSmart } from '../../lib/dates'
import { useDistricts, useMunicipalities, useServiceCategories } from '../../lib/useLookups'
import type { DistrictOption, MunicipalityOption } from '../../lib/lookups'
import { PhotoGalleryManager } from '../../components/shared/PhotoGalleryManager'
import {
  Card,
  Badge,
  Button,
  Input,
  Select,
  EmptyState,
  Spinner,
  Modal,
  Tabs,
  Accordion,
  AccordionSection,
} from '../../components/ui'
import { ServiceCard, type ServiceCardData } from '../../components/shared/ServiceCard'

// ── Types (espelham o que o backend devolve em /services/mine) ────────

interface ServiceItem extends ServiceBase {
  addressLine: string | null
  status: ServiceStatusValue
  updatedAt: string
  photos: ServicePhoto[]
  coverageAreas: Array<{ municipalityId: number }>
  category: ServiceCategory
}

type DistrictOpt = DistrictOption
type MunicipalityOpt = MunicipalityOption

// ── Helpers ───────────────────────────────────────────────────────────

const SERVICE_MAX_PHOTOS = 8
const TITLE_MAX = 200
const TITLE_MIN = 5
const DESCRIPTION_MAX = 5000
const DESCRIPTION_MIN = 50

const priceUnitOptions: Array<{ value: ServicePriceUnit; label: string }> = [
  { value: 'FIXED', label: 'Valor fixo' },
  { value: 'HOURLY', label: 'Por hora' },
  { value: 'PER_SESSION', label: 'Por sessão' },
]

const serviceStatusVariant: Record<ServiceStatusValue, 'green' | 'yellow' | 'red' | 'gray'> = {
  DRAFT: 'yellow',
  ACTIVE: 'green',
  PAUSED: 'yellow',
  SUSPENDED: 'red',
}

const serviceStatusLabel: Record<ServiceStatusValue, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Publicado',
  PAUSED: 'Pausado',
  SUSPENDED: 'Removido',
}

interface ServiceFormState {
  categoryId: string
  title: string
  description: string
  price: string
  priceUnit: ServicePriceUnit
  districtId: string
  municipalityId: string
  addressLine: string
  serviceRadiusKm: string
  website: string
  phone: string
}

const emptyServiceForm: ServiceFormState = {
  categoryId: '',
  title: '',
  description: '',
  price: '',
  priceUnit: 'PER_SESSION',
  districtId: '',
  municipalityId: '',
  addressLine: '',
  serviceRadiusKm: '',
  website: '',
  phone: '',
}

// ── Componente ────────────────────────────────────────────────────────

export function ServicesTab() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ServiceFormState>(emptyServiceForm)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoMsg, setPhotoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ALL' | ServiceStatusValue>('ALL')

  // Secções colapsáveis (form). Por defeito todas abertas para 1º anúncio.
  const [openSections, setOpenSections] = useState({
    basics: true,
    location: true,
    contact: false,
  })
  function toggleSection(key: keyof typeof openSections) {
    setOpenSections((p) => ({ ...p, [key]: !p[key] }))
  }

  // ── Queries ────────────────────────────────────────────────────────
  const { data: services, isLoading } = useQuery<{ data: ServiceItem[] }>({
    queryKey: ['services', 'mine'],
    queryFn: () => api.get('/services/mine').then((r) => r.data),
  })

  const { data: categories } = useServiceCategories()

  const { data: districts } = useDistricts()

  const { data: municipalities } = useMunicipalities(form.districtId)

  const editingService =
    editingId !== null ? (services?.data.find((s) => s.id === editingId) ?? null) : null

  // ── Mutations ──────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<ServiceItem>('/services', payload).then((r) => r.data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
      setEditingId(created.id)
      setMsg({
        type: 'success',
        text: 'Rascunho criado. Adicione pelo menos uma foto para publicar.',
      })
    },
    onError: (err) => {
      setMsg({ type: 'error', text: extractApiError(err, 'Erro ao criar anúncio.') })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.patch<ServiceItem>(`/services/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
      setMsg({ type: 'success', text: 'Anúncio atualizado com sucesso.' })
    },
    onError: (err) => {
      setMsg({ type: 'error', text: extractApiError(err, 'Erro ao atualizar anúncio.') })
    },
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.post(`/services/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
      setMsg({ type: 'success', text: 'Anúncio publicado.' })
    },
    onError: (err) => {
      setMsg({ type: 'error', text: extractApiError(err, 'Erro ao publicar anúncio.') })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: (id: number) => api.post(`/services/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
      setMsg({ type: 'success', text: 'Anúncio pausado.' })
    },
    onError: (err) => {
      setMsg({ type: 'error', text: extractApiError(err, 'Erro ao pausar anúncio.') })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
      setDeleteId(null)
      if (mode === 'edit') {
        setMode('list')
        setEditingId(null)
      }
      setMsg({ type: 'success', text: 'Anúncio removido.' })
    },
    onError: (err) => {
      setDeleteId(null)
      setMsg({ type: 'error', text: extractApiError(err, 'Erro ao remover anúncio.') })
    },
  })

  const uploadPhotosMutation = useMutation({
    mutationFn: ({ id, formData }: { id: number; formData: FormData }) =>
      api.post(`/services/${id}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
      setPhotoMsg({ type: 'success', text: 'Fotos enviadas.' })
      if (photoInputRef.current) photoInputRef.current.value = ''
    },
    onError: (err) => {
      setPhotoMsg({ type: 'error', text: extractApiError(err, 'Erro ao enviar fotos.') })
    },
  })

  const deletePhotoMutation = useMutation({
    mutationFn: ({ serviceId, photoId }: { serviceId: number; photoId: number }) =>
      api.delete(`/services/${serviceId}/photos/${photoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
    },
  })

  /**
   * Reorder optimista: actualiza imediatamente a cache para o user ver
   * a nova ordem sem flicker; em caso de erro, refetch invalida.
   */
  const reorderPhotosMutation = useMutation({
    mutationFn: ({ id, photoIds }: { id: number; photoIds: number[] }) =>
      api.patch(`/services/${id}/photos/reorder`, { photoIds }).then((r) => r.data),
    onMutate: async ({ id, photoIds }) => {
      await queryClient.cancelQueries({ queryKey: ['services', 'mine'] })
      const prev = queryClient.getQueryData<{ data: ServiceItem[] }>(['services', 'mine'])
      if (prev) {
        queryClient.setQueryData<{ data: ServiceItem[] }>(['services', 'mine'], {
          data: prev.data.map((s) => {
            if (s.id !== id) return s
            const byId = new Map(s.photos.map((p) => [p.id, p]))
            const reordered = photoIds
              .map((pid, idx) => {
                const p = byId.get(pid)
                return p ? { ...p, sortOrder: idx } : null
              })
              .filter((p): p is ServicePhoto => p !== null)
            return { ...s, photos: reordered }
          }),
        })
      }
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['services', 'mine'], ctx.prev)
      }
      setPhotoMsg({ type: 'error', text: extractApiError(err, 'Erro ao reordenar fotos.') })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['services', 'mine'] })
    },
  })

  // ── Populate form when entering edit mode ──────────────────────────
  useEffect(() => {
    if (mode !== 'edit') return
    if (!editingService) {
      setForm(emptyServiceForm)
      return
    }
    setForm({
      categoryId: String(editingService.categoryId),
      title: editingService.title,
      description: editingService.description,
      price: (editingService.priceCents / 100).toFixed(2).replace('.', ','),
      priceUnit: editingService.priceUnit,
      districtId: String(editingService.districtId),
      municipalityId: String(editingService.municipalityId),
      addressLine: editingService.addressLine ?? '',
      serviceRadiusKm: editingService.serviceRadiusKm ? String(editingService.serviceRadiusKm) : '',
      website: editingService.website ?? '',
      phone: editingService.phone ?? '',
    })
  }, [mode, editingService])

  // ── Auto-abrir form quando vem com ?new=1 (de /publicar/servico) ──
  useEffect(() => {
    if (searchParams.get('new') === '1' && mode === 'list') {
      setEditingId(null)
      setForm(emptyServiceForm)
      setMsg(null)
      setPhotoMsg(null)
      setOpenSections({ basics: true, location: true, contact: false })
      setMode('edit')
      // Limpa o param para nao reabrir se o user voltar a lista
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams, mode])

  // ── Handlers ───────────────────────────────────────────────────────
  function startNew() {
    setEditingId(null)
    setForm(emptyServiceForm)
    setMsg(null)
    setPhotoMsg(null)
    setOpenSections({ basics: true, location: true, contact: false })
    setMode('edit')
  }

  function startEdit(id: number) {
    setEditingId(id)
    setMsg(null)
    setPhotoMsg(null)
    setOpenSections({ basics: true, location: true, contact: false })
    setMode('edit')
  }

  function backToList() {
    setMode('list')
    setEditingId(null)
    setForm(emptyServiceForm)
    setMsg(null)
    setPhotoMsg(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)

    // Pré-checks que precisam de feedback orientado por secção (campos vazios
    // ou parsing de preço). O safeParse cobre depois min/max/regex/etc.
    if (!form.categoryId) {
      setMsg({ type: 'error', text: 'Selecione uma categoria.' })
      setOpenSections((p) => ({ ...p, basics: true }))
      return
    }
    const priceCents = parsePriceToCents(form.price)
    if (priceCents === null) {
      setMsg({ type: 'error', text: 'Indique um preço válido (ex.: 15,00).' })
      setOpenSections((p) => ({ ...p, basics: true }))
      return
    }
    if (!form.districtId || !form.municipalityId) {
      setMsg({ type: 'error', text: 'Selecione distrito e concelho.' })
      setOpenSections((p) => ({ ...p, location: true }))
      return
    }

    const payload: Record<string, unknown> = {
      categoryId: Number(form.categoryId),
      title: form.title.trim(),
      description: form.description.trim(),
      priceCents,
      priceUnit: form.priceUnit,
      districtId: Number(form.districtId),
      municipalityId: Number(form.municipalityId),
      addressLine: form.addressLine.trim() || undefined,
      serviceRadiusKm: form.serviceRadiusKm ? Number(form.serviceRadiusKm) : undefined,
      website: form.website.trim() || undefined,
      phone: form.phone.trim() || undefined,
    }

    // Validação completa via schema partilhado (consistente com backend).
    const parsed = createServiceSchema.safeParse(payload)
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      const path = String(first.path[0] ?? '')
      // Abre a secção certa para o utilizador ver o campo com erro.
      const sectionByField: Record<string, 'basics' | 'location' | 'contact'> = {
        categoryId: 'basics',
        title: 'basics',
        description: 'basics',
        priceCents: 'basics',
        priceUnit: 'basics',
        districtId: 'location',
        municipalityId: 'location',
        addressLine: 'location',
        serviceRadiusKm: 'location',
        phone: 'contact',
        website: 'contact',
      }
      const section = sectionByField[path]
      if (section) setOpenSections((p) => ({ ...p, [section]: true }))
      setMsg({ type: 'error', text: first.message })
      return
    }

    if (editingId === null) {
      createMutation.mutate(parsed.data as Record<string, unknown>)
    } else {
      updateMutation.mutate({ id: editingId, payload: parsed.data as Record<string, unknown> })
    }
  }

  function handleUploadPhotos(e: ChangeEvent<HTMLInputElement>) {
    setPhotoMsg(null)
    if (editingId === null) {
      setPhotoMsg({ type: 'error', text: 'Guarde o rascunho antes de enviar fotos.' })
      return
    }
    const files = e.target.files
    if (!files || files.length === 0) return
    const current = editingService?.photos.length ?? 0
    if (current + files.length > SERVICE_MAX_PHOTOS) {
      setPhotoMsg({
        type: 'error',
        text: `Máximo ${SERVICE_MAX_PHOTOS} fotos (tem ${current}).`,
      })
      e.target.value = ''
      return
    }
    const fd = new FormData()
    for (let i = 0; i < files.length; i++) {
      fd.append('photos', files[i])
    }
    uploadPhotosMutation.mutate({ id: editingId, formData: fd })
  }

  // ── Render: loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  // ── Render: edit/create form ───────────────────────────────────────
  if (mode === 'edit') {
    return (
      <ServiceEditView
        isNew={editingId === null}
        editingService={editingService}
        form={form}
        setForm={setForm}
        msg={msg}
        photoMsg={photoMsg}
        openSections={openSections}
        toggleSection={toggleSection}
        categories={categories ?? []}
        districts={districts ?? []}
        municipalities={municipalities ?? []}
        onSubmit={handleSubmit}
        onCancel={backToList}
        onUploadPhotos={handleUploadPhotos}
        photoInputRef={photoInputRef}
        onDeletePhoto={(photoId) =>
          editingService && deletePhotoMutation.mutate({ serviceId: editingService.id, photoId })
        }
        onReorderPhotos={(photoIds) =>
          editingService && reorderPhotosMutation.mutate({ id: editingService.id, photoIds })
        }
        onPublish={() => editingService && publishMutation.mutate(editingService.id)}
        onPause={() => editingService && pauseMutation.mutate(editingService.id)}
        onDelete={() => editingService && setDeleteId(editingService.id)}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        isPublishing={publishMutation.isPending}
        isPausing={pauseMutation.isPending}
        isUploadingPhotos={uploadPhotosMutation.isPending}
      />
    )
  }

  // ── Render: list ───────────────────────────────────────────────────
  const items = services?.data ?? []
  const counts = {
    ALL: items.length,
    DRAFT: items.filter((s) => s.status === 'DRAFT').length,
    ACTIVE: items.filter((s) => s.status === 'ACTIVE').length,
    PAUSED: items.filter((s) => s.status === 'PAUSED').length,
    SUSPENDED: items.filter((s) => s.status === 'SUSPENDED').length,
  }
  const filtered = statusFilter === 'ALL' ? items : items.filter((s) => s.status === statusFilter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Os meus anúncios</h3>
          <p className="text-sm text-gray-500">
            Crie e gira os seus anúncios de passeios, pet-sitting e treino.
          </p>
        </div>
        <Button onClick={startNew}>Novo anúncio</Button>
      </div>

      {msg && (
        <div
          className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${
            msg.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span>{msg.text}</span>
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="text-current opacity-60 hover:opacity-100"
            aria-label="Fechar mensagem"
          >
            ×
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Ainda não tem anúncios"
          description="Crie o seu primeiro anúncio para começar a receber contactos."
          action={<Button onClick={startNew}>Criar anúncio</Button>}
        />
      ) : (
        <>
          {/* Filtro por estado */}
          <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
            {(
              [
                ['ALL', 'Todos'],
                ['ACTIVE', 'Publicados'],
                ['DRAFT', 'Rascunhos'],
                ['PAUSED', 'Pausados'],
                ['SUSPENDED', 'Removidos'],
              ] as const
            ).map(([key, label]) => {
              const count = counts[key]
              if (key === 'SUSPENDED' && count === 0) return null
              const active = statusFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-caramel-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}{' '}
                  <span className={active ? 'text-white/80' : 'text-gray-400'}>({count})</span>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Nenhum anúncio neste estado.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => {
                const cover = s.photos[0]?.url ?? null
                return (
                  <Card key={s.id} hover={false}>
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="h-24 w-full overflow-hidden rounded-lg bg-gray-100 sm:h-20 sm:w-28 shrink-0">
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                            sem foto
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold text-gray-900 truncate">
                            {s.title}
                          </h4>
                          <Badge variant={serviceStatusVariant[s.status]}>
                            {serviceStatusLabel[s.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {s.category.namePt} · {s.municipality.namePt}, {s.district.namePt}
                        </p>
                        <p className="mt-1 text-sm font-medium text-gray-900">
                          {formatPrice(s.priceCents, s.priceUnit)}
                        </p>
                        {s.reviewCount > 0 && s.avgRating != null && (
                          <p className="mt-1 text-xs text-gray-600">
                            <span className="text-amber-500">★</span>{' '}
                            <span className="font-medium">{Number(s.avgRating).toFixed(1)}</span>{' '}
                            <span className="text-gray-500">
                              ({s.reviewCount} {s.reviewCount === 1 ? 'avaliação' : 'avaliações'})
                            </span>
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          Atualizado {formatSmart(s.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(s.id)}>
                          Editar
                        </Button>
                        {s.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={pauseMutation.isPending}
                            onClick={() => pauseMutation.mutate(s.id)}
                          >
                            Pausar
                          </Button>
                        )}
                        {s.status === 'PAUSED' && (
                          <Button
                            size="sm"
                            loading={publishMutation.isPending}
                            onClick={() => publishMutation.mutate(s.id)}
                          >
                            Retomar
                          </Button>
                        )}
                        {s.status === 'DRAFT' && s.photos.length > 0 && (
                          <Button
                            size="sm"
                            loading={publishMutation.isPending}
                            onClick={() => publishMutation.mutate(s.id)}
                          >
                            Publicar
                          </Button>
                        )}
                        {s.status !== 'SUSPENDED' && (
                          <Button size="sm" variant="danger" onClick={() => setDeleteId(s.id)}>
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <Modal isOpen={deleteId !== null} onClose={() => setDeleteId(null)} title="Remover anúncio">
        <p className="text-sm text-gray-700 mb-4">
          Tem a certeza que pretende remover este anúncio? Deixará de aparecer nas pesquisas.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
          >
            Remover
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ── Sub-componente: vista de criação/edição ──────────────────────────

interface ServiceEditViewProps {
  isNew: boolean
  editingService: ServiceItem | null
  form: ServiceFormState
  setForm: React.Dispatch<React.SetStateAction<ServiceFormState>>
  msg: { type: 'success' | 'error'; text: string } | null
  photoMsg: { type: 'success' | 'error'; text: string } | null
  openSections: { basics: boolean; location: boolean; contact: boolean }
  toggleSection: (key: 'basics' | 'location' | 'contact') => void
  categories: ServiceCategory[]
  districts: DistrictOpt[]
  municipalities: MunicipalityOpt[]
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
  onUploadPhotos: (e: ChangeEvent<HTMLInputElement>) => void
  photoInputRef: React.RefObject<HTMLInputElement>
  onDeletePhoto: (photoId: number) => void
  onReorderPhotos: (photoIds: number[]) => void
  onPublish: () => void
  onPause: () => void
  onDelete: () => void
  isSubmitting: boolean
  isPublishing: boolean
  isPausing: boolean
  isUploadingPhotos: boolean
}

function ServiceEditView(props: ServiceEditViewProps) {
  const {
    isNew,
    editingService: s,
    form,
    setForm,
    msg,
    photoMsg,
    openSections,
    toggleSection,
    categories,
    districts,
    municipalities,
    onSubmit,
    onCancel,
    onUploadPhotos,
    photoInputRef,
    onDeletePhoto,
    onReorderPhotos,
    onPublish,
    onPause,
    onDelete,
    isSubmitting,
    isPublishing,
    isPausing,
    isUploadingPhotos,
  } = props

  const canPublish = s && s.status === 'DRAFT' && s.photos.length > 0
  const canPause = s && s.status === 'ACTIVE'
  const canResume = s && s.status === 'PAUSED'

  // Preview do cartão como aparece no diretório.
  const previewCategory = useMemo(() => {
    return categories.find((c) => String(c.id) === form.categoryId) ?? null
  }, [categories, form.categoryId])
  const previewDistrict = useMemo(() => {
    return districts.find((d) => String(d.id) === form.districtId) ?? null
  }, [districts, form.districtId])
  const previewMunicipality = useMemo(() => {
    return municipalities.find((m) => String(m.id) === form.municipalityId) ?? null
  }, [municipalities, form.municipalityId])

  const previewData: ServiceCardData | null = (() => {
    if (!previewCategory || !previewDistrict || !previewMunicipality) return null
    const priceCents = parsePriceToCents(form.price) ?? 0
    return {
      id: s?.id ?? 0,
      title: form.title || 'Título do anúncio',
      description: form.description || 'Descrição do serviço',
      priceCents,
      priceUnit: form.priceUnit,
      district: { id: previewDistrict.id, namePt: previewDistrict.namePt },
      municipality: { id: previewMunicipality.id, namePt: previewMunicipality.namePt },
      category: {
        id: previewCategory.id,
        nameSlug: previewCategory.nameSlug,
        namePt: previewCategory.namePt,
      },
      photos: s?.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })) ?? [],
    }
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onCancel}>
          ← Voltar à lista
        </Button>
        {s && (
          <Badge variant={serviceStatusVariant[s.status]}>{serviceStatusLabel[s.status]}</Badge>
        )}
      </div>

      <Card hover={false}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {isNew ? 'Novo anúncio de serviço' : 'Editar anúncio'}
        </h3>

        <form onSubmit={onSubmit} className="space-y-4">
          <Accordion>
            {/* Secção 1: Sobre o serviço */}
            <AccordionSection
              title="Sobre o serviço"
              eyebrow="Identificação"
              open={openSections.basics}
              onToggle={() => toggleSection('basics')}
            >
              <div className="space-y-4">
                <Select
                  label="Categoria"
                  options={categories.map((c) => ({ value: String(c.id), label: c.namePt }))}
                  placeholder="Selecionar categoria"
                  value={form.categoryId}
                  onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                />

                <div>
                  <Input
                    label="Título"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Ex.: Passeios no Parque da Cidade"
                    maxLength={TITLE_MAX}
                  />
                  <CharCounter value={form.title} max={TITLE_MAX} min={TITLE_MIN} />
                </div>

                <div>
                  <label className="label">Descrição</label>
                  <textarea
                    className="input min-h-[120px]"
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder={`Descreva o seu serviço com detalhe (mínimo ${DESCRIPTION_MIN} caracteres).`}
                    maxLength={DESCRIPTION_MAX}
                  />
                  <CharCounter
                    value={form.description}
                    max={DESCRIPTION_MAX}
                    min={DESCRIPTION_MIN}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Preço (€)"
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                    placeholder="Ex.: 15,00"
                    inputMode="decimal"
                  />
                  <Select
                    label="Unidade"
                    options={priceUnitOptions.map((o) => ({ value: o.value, label: o.label }))}
                    value={form.priceUnit}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, priceUnit: e.target.value as ServicePriceUnit }))
                    }
                  />
                </div>
              </div>
            </AccordionSection>

            {/* Secção 2: Localização */}
            <AccordionSection
              title="Localização"
              eyebrow="Onde presta"
              open={openSections.location}
              onToggle={() => toggleSection('location')}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select
                    label="Distrito"
                    options={districts.map((d) => ({ value: String(d.id), label: d.namePt }))}
                    placeholder="Selecionar distrito"
                    value={form.districtId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, districtId: e.target.value, municipalityId: '' }))
                    }
                  />
                  <Select
                    label="Concelho"
                    options={municipalities.map((m) => ({ value: String(m.id), label: m.namePt }))}
                    placeholder="Selecionar concelho"
                    value={form.municipalityId}
                    onChange={(e) => setForm((p) => ({ ...p, municipalityId: e.target.value }))}
                    disabled={!form.districtId}
                  />
                </div>

                <Input
                  label="Morada (opcional)"
                  value={form.addressLine}
                  onChange={(e) => setForm((p) => ({ ...p, addressLine: e.target.value }))}
                  placeholder="Rua, número, código postal"
                  maxLength={255}
                />

                <Input
                  label="Raio de deslocação (km, opcional)"
                  value={form.serviceRadiusKm}
                  onChange={(e) => setForm((p) => ({ ...p, serviceRadiusKm: e.target.value }))}
                  type="number"
                  min={1}
                  max={100}
                  placeholder="Até onde se desloca"
                />
              </div>
            </AccordionSection>

            {/* Secção 3: Contactos */}
            <AccordionSection
              title="Contactos (opcional)"
              eyebrow="Telefone e website"
              open={openSections.contact}
              onToggle={() => toggleSection('contact')}
            >
              <div className="space-y-4">
                <Input
                  label="Telefone (opcional)"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+351 912 345 678"
                  type="tel"
                />
                <Input
                  label="Website (opcional)"
                  value={form.website}
                  onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                  placeholder="https://..."
                  type="url"
                />
              </div>
            </AccordionSection>
          </Accordion>

          {msg && (
            <div
              className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${
                msg.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <span>{msg.text}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={isSubmitting}>
              {isNew ? 'Criar rascunho' : 'Guardar alterações'}
            </Button>
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>

      {/* Preview do cartão */}
      {previewData && (
        <Card hover={false}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Pré-visualização</h3>
            <span className="text-xs text-gray-500">Como aparece no diretório</span>
          </div>
          <div className="max-w-sm">
            {/* Desactiva o link interno do ServiceCard durante preview */}
            <div className="pointer-events-none select-none">
              <ServiceCard {...previewData} />
            </div>
          </div>
          {previewData.photos.length === 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Adicione fotos abaixo para ver a capa no cartão.
            </p>
          )}
        </Card>
      )}

      {/* Fotos */}
      {s && (
        <PhotoGalleryManager
          photos={s.photos}
          max={SERVICE_MAX_PHOTOS}
          title="Fotos"
          emptyHint="Ainda não adicionou fotos. É necessária pelo menos uma para publicar."
          onUpload={onUploadPhotos}
          uploadInputRef={photoInputRef}
          isUploading={isUploadingPhotos}
          uploadMsg={photoMsg}
          onDelete={onDeletePhoto}
          onReorder={onReorderPhotos}
        />
      )}

      {/* Estado */}
      {s && s.status !== 'SUSPENDED' && (
        <Card hover={false}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Estado do anúncio</h3>
          <div className="flex flex-wrap gap-3">
            {canPublish && (
              <Button loading={isPublishing} onClick={onPublish}>
                Publicar
              </Button>
            )}
            {canResume && (
              <Button loading={isPublishing} onClick={onPublish}>
                Retomar publicação
              </Button>
            )}
            {canPause && (
              <Button variant="secondary" loading={isPausing} onClick={onPause}>
                Pausar
              </Button>
            )}
            <Button variant="danger" onClick={onDelete}>
              Remover anúncio
            </Button>
          </div>
          {s.status === 'DRAFT' && s.photos.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">
              Adicione pelo menos uma foto para poder publicar.
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

// ── Sub-componente: contador de caracteres ──────────────────────────

interface CharCounterProps {
  value: string
  max: number
  min?: number
}

function CharCounter({ value, max, min }: CharCounterProps) {
  const len = value.length
  const tooShort = min != null && len < min
  const nearMax = len > max * 0.9
  return (
    <p
      className={`mt-1 text-right text-xs ${
        tooShort ? 'text-amber-600' : nearMax ? 'text-orange-600' : 'text-gray-400'
      }`}
    >
      {tooShort ? (
        <>
          {len}/{max} (mín. {min})
        </>
      ) : (
        <>
          {len}/{max}
        </>
      )}
    </p>
  )
}

// ── Sub-componente: gestor de fotos com drag-reorder ─────────────────
// Movido para components/shared/PhotoGalleryManager.tsx (reutilizado pelo BreederTab).

// Re-export do `Tabs` para manter import compatível em ficheiros consumidores
// (não usado aqui, mas evita que o tree-shaker descarte se for importado de fora).
export const _ServicesTabExports = { Tabs }
