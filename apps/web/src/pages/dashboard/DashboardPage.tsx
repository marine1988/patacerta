import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import type { PaginatedMeta } from '../../lib/pagination'
import { useAuth } from '../../hooks/useAuth'
import { formatDateTime, formatSmart } from '../../lib/dates'
import {
  Tabs,
  Card,
  Avatar,
  Badge,
  Button,
  Input,
  Select,
  EmptyState,
  Spinner,
  Modal,
} from '../../components/ui'
import { VerificationBadge } from '../../components/shared/VerificationBadge'
import { PhotoGalleryManager } from '../../components/shared/PhotoGalleryManager'
import { ServicesTab } from './ServicesTab'
import { ServiceReviewsTab } from './ServiceReviewsTab'
import { MyReviewsTab } from './MyReviewsTab'
import { ReviewsAboutMeTab } from './ReviewsAboutMeTab'
import { NewThreadModal } from '../../components/messages/NewThreadModal'
import { LinkifiedText } from '../../components/messages/LinkifiedText'
import { MessageActionsMenu } from '../../components/messages/MessageActionsMenu'
import { ReportMessageModal } from '../../components/messages/ReportMessageModal'
import { MESSAGE_EDIT_WINDOW_MINUTES } from '@patacerta/shared'

// ──────────────────────────── Types ────────────────────────────

interface BreederPhoto {
  id: number
  url: string
  caption: string | null
  sortOrder: number
}

interface BreederProfile {
  id: number
  businessName: string
  nif: string
  dgavNumber: string
  website: string
  phone: string
  description: string
  status: string
  districtId: number | null
  municipalityId: number | null
  speciesIds: number[]
  verificationDocs: VerificationDoc[]
  photos?: BreederPhoto[]
  // Apresentacao publica
  youtubeVideoId?: string | null
  // Reconhecimentos oficiais
  cpcMember?: boolean
  fciAffiliated?: boolean
  // Incluido com cada cachorro
  vetCheckup?: boolean
  microchip?: boolean
  vaccinations?: boolean
  lopRegistry?: boolean
  kennelName?: boolean
  salesInvoice?: boolean
  food?: boolean
  initialTraining?: boolean
  // Recolha
  pickupInPerson?: boolean
  deliveryByCar?: boolean
  deliveryByPlane?: boolean
  pickupNotes?: string | null
}

interface VerificationDoc {
  id: number
  docType: string
  fileName: string
  status: string
}

interface Species {
  id: number
  name: string
}

interface District {
  id: number
  name: string
}

interface Municipality {
  id: number
  name: string
}

interface ThreadUser {
  id: number
  firstName: string
  lastName: string
  avatarUrl: string | null
}

interface ThreadSummary {
  id: number
  subject: string
  unreadCount: number
  updatedAt: string
  archivedByOwnerAt: string | null
  archivedByBreederAt: string | null
  owner: ThreadUser
  breeder: {
    id: number
    businessName: string
    user: ThreadUser
  }
  messages: Array<{
    id: number
    body: string
    senderId: number
    readAt: string | null
    createdAt: string
    deletedAt: string | null
  }>
}

interface ThreadMessage {
  id: number
  senderId: number
  body: string
  readAt: string | null
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  sender: ThreadUser
}

interface ThreadDetail {
  id: number
  subject: string
  owner: ThreadUser
  breeder: {
    id: number
    businessName: string
    status: string
    user: ThreadUser
  }
  messages: ThreadMessage[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

// ──────────────────────────── ProfileTab ────────────────────────────

function ProfileTab() {
  const { user, updateUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [phone, setPhone] = useState('')
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName)
      setLastName(user.lastName)
    }
  }, [user])

  const profileMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; phone: string }) =>
      api.patch('/users/me', data),
    onSuccess: (res) => {
      updateUser(res.data)
      setEditing(false)
      setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso.' })
    },
    onError: () => {
      setProfileMsg({ type: 'error', text: 'Erro ao atualizar perfil.' })
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; password: string }) =>
      api.patch('/users/me', data),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwMsg({ type: 'success', text: 'Palavra-passe alterada com sucesso.' })
    },
    onError: () => {
      setPwMsg({
        type: 'error',
        text: 'Erro ao alterar palavra-passe. Verifique a palavra-passe atual.',
      })
    },
  })

  function handleProfileSave(e: FormEvent) {
    e.preventDefault()
    setProfileMsg(null)
    profileMutation.mutate({ firstName, lastName, phone })
  }

  function handlePasswordSave(e: FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'As palavras-passe não coincidem.' })
      return
    }
    if (newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'A nova palavra-passe deve ter pelo menos 8 caracteres.' })
      return
    }
    passwordMutation.mutate({ currentPassword, password: newPassword })
  }

  if (!user) return null

  const roleBadgeVariant =
    user.role === 'BREEDER' ? 'green' : user.role === 'ADMIN' ? 'blue' : 'gray'
  const roleLabel =
    user.role === 'BREEDER' ? 'Criador' : user.role === 'ADMIN' ? 'Administrador' : 'Utilizador'

  return (
    <div className="space-y-6">
      <Card hover={false}>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Avatar name={`${user.firstName} ${user.lastName}`} size="xl" />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold text-gray-900">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-sm text-gray-500">{user.email}</p>
            <div className="mt-1">
              <Badge variant={roleBadgeVariant}>{roleLabel}</Badge>
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Editar perfil
            </Button>
          )}
        </div>

        {editing && (
          <form onSubmit={handleProfileSave} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nome"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <Input
                label="Apelido"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <Input
              label="Telefone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
            />
            {profileMsg && (
              <p
                className={`text-sm ${profileMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
              >
                {profileMsg.text}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" loading={profileMutation.isPending}>
                Guardar
              </Button>
              <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {!editing && profileMsg && (
          <p
            className={`mt-4 text-sm ${profileMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
          >
            {profileMsg.text}
          </p>
        )}
      </Card>

      <Card hover={false}>
        <h3 className="text-lg font-semibold text-gray-900">Alterar palavra-passe</h3>
        <form onSubmit={handlePasswordSave} className="mt-4 space-y-4">
          <Input
            label="Palavra-passe atual"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nova palavra-passe"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              label="Confirmar nova palavra-passe"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {pwMsg && (
            <p
              className={`text-sm ${pwMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
            >
              {pwMsg.text}
            </p>
          )}
          <Button type="submit" loading={passwordMutation.isPending}>
            Alterar palavra-passe
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ──────────────────────────── BreederTab ────────────────────────────

function BreederTab() {
  const queryClient = useQueryClient()

  const { data: breeder, isLoading } = useQuery<BreederProfile>({
    queryKey: ['breeder-profile'],
    queryFn: () => api.get('/breeders/me/profile').then((r) => r.data),
  })

  const { data: speciesList } = useQuery<Species[]>({
    queryKey: ['species'],
    queryFn: () => api.get('/search/species').then((r) => r.data),
  })

  const { data: districts } = useQuery<District[]>({
    queryKey: ['districts'],
    queryFn: () => api.get('/search/districts').then((r) => r.data),
  })

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    businessName: '',
    nif: '',
    dgavNumber: '',
    website: '',
    phone: '',
    description: '',
    districtId: '',
    municipalityId: '',
    speciesIds: [] as number[],
    youtubeVideoId: '',
    cpcMember: false,
    fciAffiliated: false,
    vetCheckup: false,
    microchip: false,
    vaccinations: false,
    lopRegistry: false,
    kennelName: false,
    salesInvoice: false,
    food: false,
    initialTraining: false,
    pickupInPerson: true,
    deliveryByCar: false,
    deliveryByPlane: false,
    pickupNotes: '',
  })
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [uploadDocType, setUploadDocType] = useState('NIF')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  // Galeria do criador
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoMsg, setPhotoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const MAX_BREEDER_PHOTOS = 10

  const isLocked = breeder?.status === 'VERIFIED' || breeder?.status === 'PENDING_VERIFICATION'

  useEffect(() => {
    if (breeder) {
      setForm({
        businessName: breeder.businessName ?? '',
        nif: breeder.nif ?? '',
        dgavNumber: breeder.dgavNumber ?? '',
        website: breeder.website ?? '',
        phone: breeder.phone ?? '',
        description: breeder.description ?? '',
        districtId: breeder.districtId ? String(breeder.districtId) : '',
        municipalityId: breeder.municipalityId ? String(breeder.municipalityId) : '',
        speciesIds: breeder.speciesIds ?? [],
        youtubeVideoId: breeder.youtubeVideoId ?? '',
        cpcMember: breeder.cpcMember ?? false,
        fciAffiliated: breeder.fciAffiliated ?? false,
        vetCheckup: breeder.vetCheckup ?? false,
        microchip: breeder.microchip ?? false,
        vaccinations: breeder.vaccinations ?? false,
        lopRegistry: breeder.lopRegistry ?? false,
        kennelName: breeder.kennelName ?? false,
        salesInvoice: breeder.salesInvoice ?? false,
        food: breeder.food ?? false,
        initialTraining: breeder.initialTraining ?? false,
        pickupInPerson: breeder.pickupInPerson ?? true,
        deliveryByCar: breeder.deliveryByCar ?? false,
        deliveryByPlane: breeder.deliveryByPlane ?? false,
        pickupNotes: breeder.pickupNotes ?? '',
      })
    }
  }, [breeder])

  const { data: municipalities } = useQuery<Municipality[]>({
    queryKey: ['municipalities', form.districtId],
    queryFn: () =>
      api.get(`/search/districts/${form.districtId}/municipalities`).then((r) => r.data),
    enabled: !!form.districtId,
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch('/breeders/me', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
      setEditing(false)
      setMsg({ type: 'success', text: 'Perfil de criador atualizado com sucesso.' })
    },
    onError: () => {
      setMsg({ type: 'error', text: 'Erro ao atualizar perfil de criador.' })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/verification/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
      setUploadMsg({ type: 'success', text: 'Documento enviado com sucesso.' })
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: () => {
      setUploadMsg({ type: 'error', text: 'Erro ao enviar documento.' })
    },
  })

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => api.delete(`/verification/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
    },
  })

  const submitVerificationMutation = useMutation({
    mutationFn: () => api.post('/breeders/me/submit-verification'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
      setMsg({ type: 'success', text: 'Submetido para verifica──o com sucesso.' })
    },
    onError: () => {
      setMsg({ type: 'error', text: 'Erro ao submeter para verifica──o.' })
    },
  })

  // Galeria — uploads, delete, reorder
  const uploadPhotosMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/breeders/me/photos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
      setPhotoMsg({ type: 'success', text: 'Fotos enviadas com sucesso.' })
      if (photoInputRef.current) photoInputRef.current.value = ''
    },
    onError: (err) => {
      setPhotoMsg({ type: 'error', text: extractApiError(err, 'Erro ao enviar fotos.') })
    },
  })

  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: number) => api.delete(`/breeders/me/photos/${photoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
    },
    onError: (err) => {
      setPhotoMsg({ type: 'error', text: extractApiError(err, 'Erro ao remover foto.') })
    },
  })

  const reorderPhotosMutation = useMutation({
    mutationFn: (photoIds: number[]) => api.patch('/breeders/me/photos/reorder', { photoIds }),
    onMutate: async (photoIds) => {
      await queryClient.cancelQueries({ queryKey: ['breeder-profile'] })
      const previous = queryClient.getQueryData<BreederProfile>(['breeder-profile'])
      if (previous?.photos) {
        const map = new Map(previous.photos.map((p) => [p.id, p]))
        const reordered = photoIds
          .map((id, idx) => {
            const p = map.get(id)
            return p ? { ...p, sortOrder: idx } : null
          })
          .filter((p): p is BreederPhoto => p !== null)
        queryClient.setQueryData<BreederProfile>(['breeder-profile'], {
          ...previous,
          photos: reordered,
        })
      }
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['breeder-profile'], context.previous)
      }
      setPhotoMsg({ type: 'error', text: extractApiError(err, 'Erro ao reordenar fotos.') })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
    },
  })

  function handleUploadPhotos(e: ChangeEvent<HTMLInputElement>) {
    setPhotoMsg(null)
    const files = e.target.files
    if (!files || files.length === 0) return
    const existing = breeder?.photos?.length ?? 0
    if (existing + files.length > MAX_BREEDER_PHOTOS) {
      setPhotoMsg({
        type: 'error',
        text: `M─ximo ${MAX_BREEDER_PHOTOS} fotos (tem ${existing}).`,
      })
      return
    }
    const fd = new FormData()
    Array.from(files).forEach((f) => fd.append('photos', f))
    uploadPhotosMutation.mutate(fd)
  }

  function handleSave(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    saveMutation.mutate({
      businessName: form.businessName,
      nif: form.nif,
      dgavNumber: form.dgavNumber,
      website: form.website,
      phone: form.phone,
      description: form.description,
      districtId: form.districtId ? Number(form.districtId) : null,
      municipalityId: form.municipalityId ? Number(form.municipalityId) : null,
      speciesIds: form.speciesIds,
      youtubeVideoId: form.youtubeVideoId,
      cpcMember: form.cpcMember,
      fciAffiliated: form.fciAffiliated,
      vetCheckup: form.vetCheckup,
      microchip: form.microchip,
      vaccinations: form.vaccinations,
      lopRegistry: form.lopRegistry,
      kennelName: form.kennelName,
      salesInvoice: form.salesInvoice,
      food: form.food,
      initialTraining: form.initialTraining,
      pickupInPerson: form.pickupInPerson,
      deliveryByCar: form.deliveryByCar,
      deliveryByPlane: form.deliveryByPlane,
      pickupNotes: form.pickupNotes,
    })
  }

  function handleUpload(e: FormEvent) {
    e.preventDefault()
    setUploadMsg(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setUploadMsg({ type: 'error', text: 'Selecione um ficheiro.' })
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docType', uploadDocType)
    uploadMutation.mutate(fd)
  }

  function toggleSpecies(id: number) {
    setForm((prev) => ({
      ...prev,
      speciesIds: prev.speciesIds.includes(id)
        ? prev.speciesIds.filter((s) => s !== id)
        : [...prev.speciesIds, id],
    }))
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!breeder) {
    // Should never happen — BreederOnboardingGuard redirects to /onboarding/criador
    // before this tab can render. Keep as defensive fallback.
    return (
      <EmptyState
        title="Perfil de criador não encontrado"
        description="Vamos redirecioná-lo para completar o seu perfil."
        action={
          <Button onClick={() => (window.location.href = '/onboarding/criador')}>
            Completar perfil
          </Button>
        }
      />
    )
  }

  const docTypeOptions = [
    { value: 'NIF', label: 'NIF' },
    { value: 'DGAV', label: 'DGAV' },
    { value: 'CARTAO_CIDADAO', label: 'Cartão de Cidadão' },
    { value: 'CITES', label: 'CITES' },
    { value: 'OTHER', label: 'Outro' },
  ]

  const docStatusVariant: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
    PENDING: 'yellow',
    APPROVED: 'green',
    REJECTED: 'red',
  }

  const docStatusLabel: Record<string, string> = {
    PENDING: 'Pendente',
    APPROVED: 'Aprovado',
    REJECTED: 'Rejeitado',
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card hover={false}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Estado do criador</h3>
            <div className="mt-2">
              <VerificationBadge status={breeder.status} />
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
      </Card>

      {/* Edit form */}
      {editing && (
        <Card hover={false}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nome comercial"
                value={form.businessName}
                onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
                disabled={isLocked}
              />
              <Input
                label="NIF"
                value={form.nif}
                onChange={(e) => setForm((p) => ({ ...p, nif: e.target.value }))}
                disabled={isLocked}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Número DGAV"
                value={form.dgavNumber}
                onChange={(e) => setForm((p) => ({ ...p, dgavNumber: e.target.value }))}
                disabled={isLocked}
              />
              <Input
                label="Website"
                value={form.website}
                onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
              />
            </div>
            <Input
              label="Telefone"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              type="tel"
            />
            <div>
              <label className="label">Descrição</label>
              <textarea
                className="input min-h-[100px]"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* Species */}
            <div>
              <label className="label">Espécies</label>
              <div className="mt-1 flex flex-wrap gap-3">
                {speciesList?.map((sp) => (
                  <label key={sp.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.speciesIds.includes(sp.id)}
                      onChange={() => toggleSpecies(sp.id)}
                      className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                    />
                    {sp.name}
                  </label>
                ))}
              </div>
            </div>

            {/* District / Municipality */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Distrito"
                options={(districts ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
                placeholder="Selecionar distrito"
                value={form.districtId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, districtId: e.target.value, municipalityId: '' }))
                }
              />
              <Select
                label="Município"
                options={(municipalities ?? []).map((m) => ({
                  value: String(m.id),
                  label: m.name,
                }))}
                placeholder="Selecionar município"
                value={form.municipalityId}
                onChange={(e) => setForm((p) => ({ ...p, municipalityId: e.target.value }))}
                disabled={!form.districtId}
              />
            </div>

            {/* V─deo de apresenta──o */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                V─deo de apresenta──o (YouTube)
              </h4>
              <Input
                label="URL ou ID do v─deo YouTube"
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.youtubeVideoId}
                onChange={(e) => setForm((p) => ({ ...p, youtubeVideoId: e.target.value }))}
              />
              <p className="mt-1 text-xs text-gray-500">
                Cole o link completo ou apenas o ID. Deixe vazio para remover.
              </p>
            </div>

            {/* Reconhecimentos oficiais */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Reconhecimentos oficiais
              </h4>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.cpcMember}
                    onChange={(e) => setForm((p) => ({ ...p, cpcMember: e.target.checked }))}
                    className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                  />
                  Membro do CPC (Clube Portugu─s de Canicultura)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.fciAffiliated}
                    onChange={(e) => setForm((p) => ({ ...p, fciAffiliated: e.target.checked }))}
                    className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                  />
                  Filiado FCI (F─d─ration Cynologique Internationale)
                </label>
              </div>
            </div>

            {/* O que est─ inclu─do */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                O que est─ inclu─do com cada cachorro
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    { key: 'vetCheckup', label: 'Check-up veterin─rio' },
                    { key: 'microchip', label: 'Microchip implantado' },
                    { key: 'vaccinations', label: 'Vacina──o em dia' },
                    { key: 'lopRegistry', label: 'Registo no LOP' },
                    { key: 'kennelName', label: 'Nome de canil' },
                    { key: 'salesInvoice', label: 'Factura de venda' },
                    { key: 'food', label: 'Alimenta──o inicial' },
                    { key: 'initialTraining', label: 'Treino inicial' },
                  ] as const
                ).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
                      className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Recolha / entrega */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Levar para casa
              </h4>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.pickupInPerson}
                    onChange={(e) => setForm((p) => ({ ...p, pickupInPerson: e.target.checked }))}
                    className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                  />
                  Recolha presencial no canil
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.deliveryByCar}
                    onChange={(e) => setForm((p) => ({ ...p, deliveryByCar: e.target.checked }))}
                    className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                  />
                  Entrega ao domic─lio (carro)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.deliveryByPlane}
                    onChange={(e) => setForm((p) => ({ ...p, deliveryByPlane: e.target.checked }))}
                    className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                  />
                  Envio por avi─o
                </label>
              </div>
              <div className="mt-3">
                <label className="label">Notas sobre recolha / entrega</label>
                <textarea
                  className="input min-h-[80px]"
                  value={form.pickupNotes}
                  onChange={(e) => setForm((p) => ({ ...p, pickupNotes: e.target.value }))}
                  placeholder="Custos, condi──es, zonas cobertas..."
                  maxLength={1000}
                />
              </div>
            </div>

            {msg && (
              <p
                className={`text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
              >
                {msg.text}
              </p>
            )}

            <div className="flex gap-3">
              <Button type="submit" loading={saveMutation.isPending}>
                Guardar
              </Button>
              <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!editing && msg && (
        <p className={`text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}

      {/* Galeria de fotos do criador */}
      <PhotoGalleryManager
        photos={breeder.photos ?? []}
        max={MAX_BREEDER_PHOTOS}
        title="Galeria do criador"
        emptyHint="Ainda n─o adicionou fotos. Mostre as suas instala──es, cuidados, ambiente."
        onUpload={handleUploadPhotos}
        uploadInputRef={photoInputRef}
        isUploading={uploadPhotosMutation.isPending}
        uploadMsg={photoMsg}
        onDelete={(photoId: number) => deletePhotoMutation.mutate(photoId)}
        onReorder={(photoIds: number[]) => reorderPhotosMutation.mutate(photoIds)}
      />

      {/* Documents */}
      <Card hover={false}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentos de verificação</h3>

        {breeder.verificationDocs.length > 0 ? (
          <div className="space-y-3 mb-6">
            {breeder.verificationDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">{doc.docType}</span>
                  <span className="text-sm text-gray-500">{doc.fileName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={docStatusVariant[doc.status] ?? 'gray'}>
                    {docStatusLabel[doc.status] ?? doc.status}
                  </Badge>
                  {doc.status === 'PENDING' && (
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleteDocMutation.isPending}
                      onClick={() => deleteDocMutation.mutate(doc.id)}
                    >
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-6 text-sm text-gray-500">Nenhum documento enviado.</p>
        )}

        {/* Upload */}
        <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
          <Select
            label="Tipo de documento"
            options={docTypeOptions}
            value={uploadDocType}
            onChange={(e) => setUploadDocType(e.target.value)}
          />
          <div>
            <label className="label">Ficheiro</label>
            <input
              ref={fileInputRef}
              type="file"
              className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-caramel-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-caramel-700 hover:file:bg-caramel-100"
            />
          </div>
          <Button type="submit" loading={uploadMutation.isPending}>
            Enviar
          </Button>
        </form>
        {uploadMsg && (
          <p
            className={`mt-2 text-sm ${uploadMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
          >
            {uploadMsg.text}
          </p>
        )}
      </Card>

      {/* Submit verification */}
      {breeder.status === 'DRAFT' && breeder.verificationDocs.length > 0 && (
        <Button
          loading={submitVerificationMutation.isPending}
          onClick={() => submitVerificationMutation.mutate()}
        >
          Submeter para verificação
        </Button>
      )}
    </div>
  )
}

// ──────────────────────────── MessagesTab ────────────────────────────

function MessagesTab() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(() => {
    const t = searchParams.get('threadId')
    return t ? Number(t) : null
  })
  const [replyText, setReplyText] = useState('')
  const [newThreadOpen, setNewThreadOpen] = useState(false)
  const [newThreadError, setNewThreadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Archive filter (active vs archived threads)
  const [showArchived, setShowArchived] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState('')

  // Edit / delete / report UI state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [reportTargetId, setReportTargetId] = useState<number | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  const breederIdParam = searchParams.get('breederId')
  const pendingBreederId = breederIdParam ? Number(breederIdParam) : null

  const { data: targetBreeder } = useQuery<{ id: number; businessName: string; userId: number }>({
    queryKey: ['breeder', pendingBreederId],
    queryFn: () => api.get(`/breeders/${pendingBreederId}`).then((r) => r.data),
    enabled: !!pendingBreederId,
  })

  // When ?breederId is present and valid, open the new-thread modal.
  useEffect(() => {
    if (!pendingBreederId || !targetBreeder) return
    if (user && targetBreeder.userId === user.id) {
      // self, clear silently
      searchParams.delete('breederId')
      setSearchParams(searchParams, { replace: true })
      return
    }
    setNewThreadOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBreederId, targetBreeder?.id])

  const { data: threadsData, isLoading: threadsLoading } = useQuery<{
    data: ThreadSummary[]
    meta: PaginatedMeta
  }>({
    queryKey: ['threads', showArchived ? 'archived' : 'active'],
    queryFn: () =>
      api
        .get(`/messages/threads?page=1&limit=50&archived=${showArchived ? 'true' : 'false'}`)
        .then((r) => r.data),
    refetchInterval: 30_000,
  })

  const threads = threadsData?.data ?? []

  const {
    data: threadPages,
    isLoading: threadLoading,
    isError: threadError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery<ThreadDetail, Error>({
    queryKey: ['thread', selectedThreadId],
    queryFn: ({ pageParam = 1 }) =>
      api
        .get(`/messages/threads/${selectedThreadId}?page=${pageParam}&limit=50`)
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      // Next page = older messages. Server page 1 = newest; page 2 = older; etc.
      const p = lastPage.pagination
      return p.page < p.totalPages ? p.page + 1 : undefined
    },
    enabled: !!selectedThreadId,
    refetchInterval: selectedThreadId ? 15_000 : false,
    refetchOnWindowFocus: true,
  })

  // Head page (newest messages) is always pages[0]; older pages append.
  // Concatenate in ascending chronological order: oldest page first.
  const threadDetail: ThreadDetail | undefined = threadPages?.pages[0]
  const allMessages: ThreadMessage[] = threadPages
    ? threadPages.pages
        .slice()
        .reverse()
        .flatMap((p) => p.messages)
    : []

  // Sync selectedThreadId to URL
  useEffect(() => {
    if (selectedThreadId) {
      searchParams.set('threadId', String(selectedThreadId))
    } else {
      searchParams.delete('threadId')
    }
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId])

  // Auto-scroll to bottom:
  //  - when the thread changes (initial open)
  //  - when a new message is appended at the tail (newest id changed)
  // NOT when older pages are loaded via fetchNextPage.
  const lastMessageIdRef = useRef<number | null>(null)
  const lastThreadIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (!threadDetail) return
    const newestId = allMessages.length > 0 ? allMessages[allMessages.length - 1].id : null
    const threadChanged = lastThreadIdRef.current !== threadDetail.id
    const tailChanged = lastMessageIdRef.current !== newestId
    if (threadChanged || tailChanged) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: threadChanged ? 'auto' : 'smooth',
          block: 'end',
        })
      })
    }
    lastThreadIdRef.current = threadDetail.id
    lastMessageIdRef.current = newestId

    // If a new incoming (not our own) message arrived while the thread is open,
    // auto-mark it as read to clear the unread badge without requiring a click.
    const newestMessage = allMessages[allMessages.length - 1]
    if (
      tailChanged &&
      !threadChanged &&
      newestMessage &&
      newestMessage.senderId !== user?.id &&
      newestMessage.id > 0 &&
      !newestMessage.readAt
    ) {
      markReadMutation.mutate(threadDetail.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadDetail?.id, allMessages.length, allMessages[allMessages.length - 1]?.id])

  const markReadMutation = useMutation({
    mutationFn: (threadId: number) => api.patch(`/messages/threads/${threadId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
    },
  })

  const replyMutation = useMutation({
    mutationFn: (data: { threadId: number; body: string }) =>
      api.post(`/messages/threads/${data.threadId}/messages`, { body: data.body }),
    // Optimistic insert: append a temporary message with a negative id to the newest page
    onMutate: async (data) => {
      if (!user) return
      const queryKey = ['thread', data.threadId]
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<{
        pages: ThreadDetail[]
        pageParams: number[]
      }>(queryKey)
      if (!previous) return { previous }

      const tempId = -Date.now()
      const optimisticMessage: ThreadMessage = {
        id: tempId,
        senderId: user.id,
        body: data.body,
        readAt: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        sender: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: null,
        },
      }

      queryClient.setQueryData(queryKey, {
        ...previous,
        pages: previous.pages.map((p, idx) =>
          idx === 0 ? { ...p, messages: [...p.messages, optimisticMessage] } : p,
        ),
      })
      return { previous, tempId }
    },
    onSuccess: (res, _variables, _context) => {
      setReplyText('')
      setSendError(null)
      // Replace optimistic entry (or just refetch) by invalidating
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      void res
    },
    onError: (err, _variables, context) => {
      if (context?.previous && selectedThreadId) {
        queryClient.setQueryData(['thread', selectedThreadId], context.previous)
      }
      setSendError(extractApiError(err, 'Erro ao enviar mensagem.'))
    },
  })

  const createThreadMutation = useMutation({
    mutationFn: (values: { subject: string; body: string }) =>
      api
        .post('/messages/threads', { breederId: pendingBreederId!, ...values })
        .then((r) => r.data),
    onSuccess: (res) => {
      setNewThreadOpen(false)
      setNewThreadError(null)
      searchParams.delete('breederId')
      searchParams.set('threadId', String(res.threadId))
      setSearchParams(searchParams, { replace: true })
      setSelectedThreadId(res.threadId)
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
    },
    onError: (err) => {
      setNewThreadError(extractApiError(err, 'Erro ao criar conversa.'))
    },
  })

  const archiveMutation = useMutation({
    mutationFn: ({ threadId, archive }: { threadId: number; archive: boolean }) =>
      api.patch(`/messages/threads/${threadId}/${archive ? 'archive' : 'unarchive'}`),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
      // If the archived thread was open, close its detail view
      if (variables.archive && selectedThreadId === variables.threadId) {
        setSelectedThreadId(null)
      }
    },
  })

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: number; body: string }) =>
      api.patch(`/messages/messages/${messageId}`, { body }).then((r) => r.data),
    onSuccess: () => {
      setEditingMessageId(null)
      setEditText('')
      setEditError(null)
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
    },
    onError: (err) => {
      setEditError(extractApiError(err, 'Erro ao editar mensagem.'))
    },
  })

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: number) => api.delete(`/messages/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
    },
  })

  const reportMessageMutation = useMutation({
    mutationFn: ({ messageId, reason }: { messageId: number; reason: string }) =>
      api.post(`/messages/messages/${messageId}/report`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setReportTargetId(null)
      setReportError(null)
    },
    onError: (err) => {
      setReportError(extractApiError(err, 'Erro ao denunciar mensagem.'))
    },
  })

  // Search
  interface SearchHit {
    id: number
    body: string
    createdAt: string
    senderId: number
    threadId: number
    sender: ThreadUser
    thread: {
      id: number
      subject: string
      owner: { id: number; firstName: string; lastName: string }
      breeder: { id: number; businessName: string }
    }
  }
  const { data: searchResults, isFetching: searchLoading } = useQuery<{
    data: SearchHit[]
    meta: PaginatedMeta
  }>({
    queryKey: ['messages', 'search', searchSubmitted],
    queryFn: () =>
      api
        .get(`/messages/search?q=${encodeURIComponent(searchSubmitted)}&page=1&limit=20`)
        .then((r) => r.data),
    enabled: searchSubmitted.length >= 2,
    staleTime: 10_000,
  })

  function openThread(threadId: number) {
    setSelectedThreadId(threadId)
    markReadMutation.mutate(threadId)
  }

  function handleReply(e: FormEvent) {
    e.preventDefault()
    setSendError(null)
    if (!replyText.trim() || !selectedThreadId) return
    replyMutation.mutate({ threadId: selectedThreadId, body: replyText.trim() })
  }

  if (threadsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  // Thread detail view
  if (selectedThreadId) {
    if (threadLoading) {
      return (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )
    }

    if (threadError || !threadDetail) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setSelectedThreadId(null)}>
            &larr; Voltar
          </Button>
          <EmptyState title="Conversa não encontrada" />
        </div>
      )
    }

    const otherParty =
      user && threadDetail.owner.id === user.id
        ? {
            name: threadDetail.breeder.businessName,
            avatarName: threadDetail.breeder.businessName,
          }
        : {
            name: `${threadDetail.owner.firstName} ${threadDetail.owner.lastName}`,
            avatarName: `${threadDetail.owner.firstName} ${threadDetail.owner.lastName}`,
          }

    const canLoadOlder = !!hasNextPage

    // Thread archive state from the current user's perspective
    const currentThreadSummary = threads.find((t) => t.id === threadDetail.id)
    const isArchivedForMe = currentThreadSummary
      ? user && threadDetail.owner.id === user.id
        ? !!currentThreadSummary.archivedByOwnerAt
        : !!currentThreadSummary.archivedByBreederAt
      : false

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedThreadId(null)}>
            &larr; Voltar às conversas
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={archiveMutation.isPending}
            onClick={() =>
              archiveMutation.mutate({
                threadId: threadDetail.id,
                archive: !isArchivedForMe,
              })
            }
          >
            {isArchivedForMe ? 'Desarquivar' : 'Arquivar'}
          </Button>
        </div>

        <Card hover={false}>
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <Avatar name={otherParty.avatarName} size="md" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold text-gray-900">
                {threadDetail.subject}
              </h3>
              <p className="text-sm text-gray-500">Com: {otherParty.name}</p>
            </div>
          </div>

          <div className="mt-4 max-h-[500px] space-y-3 overflow-y-auto">
            {canLoadOlder && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  Carregar mensagens anteriores
                </Button>
              </div>
            )}

            {allMessages.map((msg) => {
              const isOwn = msg.senderId === user?.id
              const senderName = `${msg.sender.firstName} ${msg.sender.lastName}`
              const isPending = msg.id < 0
              const isDeleted = !!msg.deletedAt
              const isEdited = !!msg.editedAt && !isDeleted
              const ageMs = Date.now() - new Date(msg.createdAt).getTime()
              const withinEditWindow = ageMs < MESSAGE_EDIT_WINDOW_MINUTES * 60_000
              const canEdit = isOwn && !isDeleted && !isPending && withinEditWindow
              const canDelete = canEdit
              const canReport = !isOwn && !isDeleted && !isPending

              if (isDeleted) {
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%] rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 italic text-gray-400">
                      <p className="text-sm">(mensagem eliminada pelo autor)</p>
                      <p className="mt-1 text-xs text-gray-400">{formatDateTime(msg.createdAt)}</p>
                    </div>
                  </div>
                )
              }

              const isEditing = editingMessageId === msg.id

              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`group relative max-w-[75%] rounded-lg px-4 py-2 ${
                      isOwn ? 'bg-caramel-600 text-white' : 'bg-gray-100 text-gray-900'
                    } ${isPending ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`mb-1 text-xs font-medium ${
                          isOwn ? 'text-caramel-100' : 'text-gray-500'
                        }`}
                      >
                        {senderName}
                      </p>
                      {!isEditing && (
                        <MessageActionsMenu
                          variant={isOwn ? 'own' : 'other'}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          canReport={canReport}
                          onEdit={() => {
                            setEditingMessageId(msg.id)
                            setEditText(msg.body)
                            setEditError(null)
                          }}
                          onDelete={() => {
                            if (
                              window.confirm(
                                'Eliminar esta mensagem? Esta ação não pode ser desfeita.',
                              )
                            ) {
                              deleteMessageMutation.mutate(msg.id)
                            }
                          }}
                          onReport={() => {
                            setReportTargetId(msg.id)
                            setReportError(null)
                          }}
                        />
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          className="input min-h-[60px] text-gray-900"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          maxLength={5000}
                          autoFocus
                        />
                        {editError && <p className="text-xs text-red-200">{editError}</p>}
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => {
                              setEditingMessageId(null)
                              setEditText('')
                              setEditError(null)
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            loading={editMessageMutation.isPending}
                            onClick={() => {
                              const trimmed = editText.trim()
                              if (!trimmed) {
                                setEditError('Mensagem não pode estar vazia.')
                                return
                              }
                              editMessageMutation.mutate({
                                messageId: msg.id,
                                body: trimmed,
                              })
                            }}
                          >
                            Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <LinkifiedText
                        text={msg.body}
                        className="block whitespace-pre-wrap text-sm"
                        linkClassName={
                          isOwn
                            ? 'underline decoration-caramel-200 underline-offset-2 hover:text-white'
                            : 'text-caramel-700 underline decoration-dotted underline-offset-2 hover:decoration-solid'
                        }
                      />
                    )}

                    <p
                      className={`mt-1 text-xs ${isOwn ? 'text-caramel-200' : 'text-gray-400'}`}
                      title={formatDateTime(msg.createdAt)}
                    >
                      {formatDateTime(msg.createdAt)}
                      {isEdited && ' · editada'}
                      {isOwn && msg.readAt && ' · lida'}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleReply} className="mt-6 space-y-2">
            <div className="flex gap-3">
              <textarea
                className="input min-h-[60px] flex-1"
                placeholder="Escrever resposta..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                maxLength={5000}
                required
              />
              <Button type="submit" loading={replyMutation.isPending}>
                Enviar
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{replyText.length}/5000</p>
              {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            </div>
          </form>
        </Card>

        <ReportMessageModal
          isOpen={reportTargetId !== null}
          onClose={() => setReportTargetId(null)}
          onSubmit={(reason) =>
            reportTargetId !== null &&
            reportMessageMutation.mutate({ messageId: reportTargetId, reason })
          }
          isSubmitting={reportMessageMutation.isPending}
          errorMessage={reportError}
        />
      </div>
    )
  }

  // Thread list
  const hasSearch = searchSubmitted.length >= 2
  return (
    <>
      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSearchSubmitted(searchQuery.trim())
        }}
        className="mb-4 flex gap-2"
      >
        <input
          type="search"
          className="input flex-1"
          placeholder="Pesquisar nas suas conversas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          minLength={2}
        />
        <Button type="submit" variant="secondary" disabled={searchQuery.trim().length < 2}>
          Pesquisar
        </Button>
        {hasSearch && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearchQuery('')
              setSearchSubmitted('')
            }}
          >
            Limpar
          </Button>
        )}
      </form>

      {/* Active/Archived tabs */}
      {!hasSearch && (
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          <button
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              !showArchived
                ? 'border-caramel-600 text-caramel-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setShowArchived(false)}
          >
            Activas
          </button>
          <button
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              showArchived
                ? 'border-caramel-600 text-caramel-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setShowArchived(true)}
          >
            Arquivadas
          </button>
        </div>
      )}

      {hasSearch ? (
        searchLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : !searchResults || searchResults.data.length === 0 ? (
          <EmptyState
            title="Sem resultados"
            description={`Nenhuma mensagem corresponde a "${searchSubmitted}".`}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {searchResults.meta.total} resultado(s) para{' '}
              <strong>&ldquo;{searchSubmitted}&rdquo;</strong>
            </p>
            {searchResults.data.map((hit) => {
              const isOwner = user?.id === hit.thread.owner.id
              const otherName = isOwner
                ? hit.thread.breeder.businessName
                : `${hit.thread.owner.firstName} ${hit.thread.owner.lastName}`
              return (
                <Card
                  key={hit.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedThreadId(hit.threadId)
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={otherName} size="md" />
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold text-gray-900">
                        {hit.thread.subject}
                      </h4>
                      <p className="text-xs text-gray-500">{otherName}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{hit.body}</p>
                      <p className="mt-1 text-xs text-gray-400">{formatDateTime(hit.createdAt)}</p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : threads.length === 0 ? (
        <EmptyState
          title={showArchived ? 'Sem conversas arquivadas' : 'Sem mensagens'}
          description={
            showArchived
              ? 'As conversas que arquivar aparecerão aqui.'
              : 'Quando contactar ou for contactado por criadores, as mensagens aparecerão aqui.'
          }
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => {
            const isOwner = user?.id === thread.owner.id
            const otherName = isOwner
              ? thread.breeder.businessName
              : `${thread.owner.firstName} ${thread.owner.lastName}`
            const lastMessage = thread.messages[0]
            const lastBody = lastMessage?.deletedAt ? '(mensagem eliminada)' : lastMessage?.body
            return (
              <Card
                key={thread.id}
                hover
                className="cursor-pointer"
                onClick={() => openThread(thread.id)}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={otherName} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-gray-900">
                        {thread.subject}
                      </h4>
                      {thread.unreadCount > 0 && <Badge variant="blue">{thread.unreadCount}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500">{otherName}</p>
                    {lastBody && (
                      <p
                        className={`truncate text-sm ${
                          lastMessage?.deletedAt ? 'italic text-gray-400' : 'text-gray-400'
                        }`}
                      >
                        {lastBody}
                      </p>
                    )}
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-gray-400">
                    {formatSmart(thread.updatedAt)}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <NewThreadModal
        isOpen={newThreadOpen}
        onClose={() => {
          setNewThreadOpen(false)
          searchParams.delete('breederId')
          setSearchParams(searchParams, { replace: true })
        }}
        onSubmit={(values) => createThreadMutation.mutate(values)}
        breederName={targetBreeder?.businessName}
        defaultSubject={targetBreeder ? `Contacto sobre ${targetBreeder.businessName}` : undefined}
        isSubmitting={createThreadMutation.isPending}
        errorMessage={newThreadError}
      />
    </>
  )
}
// ──────────────────────────── SettingsTab ────────────────────────────

function SettingsTab() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [notifyMessages, setNotifyMessages] = useState(
    () => localStorage.getItem('notify_messages') !== 'false',
  )
  const [notifyVerification, setNotifyVerification] = useState(
    () => localStorage.getItem('notify_verification') !== 'false',
  )
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  function toggleNotifyMessages(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.checked
    setNotifyMessages(val)
    localStorage.setItem('notify_messages', String(val))
  }

  function toggleNotifyVerification(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.checked
    setNotifyVerification(val)
    localStorage.setItem('notify_verification', String(val))
  }

  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/users/me'),
    onSuccess: () => {
      logout()
      navigate('/')
    },
  })

  async function handleExport() {
    try {
      const { data } = await api.get('/users/me')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dados-${user?.email ?? 'utilizador'}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // export failed silently
    }
  }

  return (
    <div className="space-y-6">
      <Card hover={false}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notificações</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Novas mensagens</p>
              <p className="text-xs text-gray-500">
                Receber notificação quando receber uma nova mensagem.
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifyMessages}
              onChange={toggleNotifyMessages}
              className="h-4 w-4 rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Atualizações de verificação</p>
              <p className="text-xs text-gray-500">
                Receber notificação sobre o estado da verificação.
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifyVerification}
              onChange={toggleNotifyVerification}
              className="h-4 w-4 rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
            />
          </label>
        </div>
      </Card>

      <Card hover={false}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dados e privacidade</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={handleExport}>
            Exportar dados (RGPD)
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Eliminar conta
          </Button>
        </div>
      </Card>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar conta"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-6">
          Tem a certeza de que deseja eliminar a sua conta? Esta ação é irreversível e todos os seus
          dados serão permanentemente apagados.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Eliminar definitivamente
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ──────────────────────────── DashboardPage ────────────────────────────

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  // Tabs derivam de "tem perfil/servicos?", nao do role. Permite ter
  // simultaneamente perfil de criador e servicos no mesmo painel.
  const { data: breederProbe } = useQuery<{ id: number } | null>({
    queryKey: ['breeder-profile-probe', user?.id],
    queryFn: () =>
      api
        .get('/breeders/me/profile')
        .then((r) => r.data)
        .catch(() => null),
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  })
  const { data: servicesProbe } = useQuery<{ data: Array<{ id: number }> } | null>({
    queryKey: ['my-services-probe', user?.id],
    queryFn: () =>
      api
        .get('/services/mine')
        .then((r) => r.data)
        .catch(() => null),
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  })

  const tabParam = searchParams.get('tab') ?? 'profile'
  const hasBreederProfile = !!breederProbe?.id
  const hasServices = !!servicesProbe?.data && servicesProbe.data.length > 0
  const isBreeder = hasBreederProfile
  // Tab de servicos aparece se ja presta servicos OU se e OWNER autenticado
  // (para poder criar o primeiro). Admin nao tem painel de servicos.
  const showServicesTab =
    !!user &&
    user.role !== 'ADMIN' &&
    (hasServices || user.role === 'OWNER' || user.role === 'SERVICE_PROVIDER')

  const tabs = [
    {
      id: 'profile',
      label: 'Perfil',
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
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      ),
      content: <ProfileTab />,
    },
    ...(isBreeder
      ? [
          {
            id: 'breeder',
            label: 'Criador',
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
            content: <BreederTab />,
          },
        ]
      : []),
    ...(showServicesTab
      ? [
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
                  d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
            ),
            content: <ServicesTab />,
          },
        ]
      : []),
    {
      id: 'mensagens',
      label: 'Mensagens',
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
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
        </svg>
      ),
      content: <MessagesTab />,
    },
    {
      id: 'avaliacoes',
      label: isBreeder ? 'Avaliações sobre mim' : 'Minhas avaliações',
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
      content: isBreeder ? <ReviewsAboutMeTab /> : <MyReviewsTab />,
    },
    ...(showServicesTab
      ? [
          {
            id: 'avaliacoes-servicos',
            label: 'Avalia──es de servi─os',
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
            content: <ServiceReviewsTab />,
          },
        ]
      : []),
    {
      id: 'definicoes',
      label: 'Definições',
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
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      content: <SettingsTab />,
    },
  ]

  const defaultTab = tabs.some((t) => t.id === tabParam) ? tabParam : 'profile'

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Painel de controlo</h1>
        <p className="page-subtitle">Gerir o seu perfil, mensagens e definições.</p>
      </div>

      <Tabs tabs={tabs} defaultTab={defaultTab} />
    </div>
  )
}
