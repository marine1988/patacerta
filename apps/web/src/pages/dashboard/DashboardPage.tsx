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
  Accordion,
  AccordionSection,
} from '../../components/ui'
import { VerificationBadge } from '../../components/shared/VerificationBadge'
import { PhotoGalleryManager } from '../../components/shared/PhotoGalleryManager'
import { BreedMultiCombobox } from '../../components/shared/BreedMultiCombobox'
import { ServicesTab } from './ServicesTab'
import { MyReviewsTab } from './MyReviewsTab'
import { ReceivedReviewsTab } from './ReceivedReviewsTab'
import { NewThreadModal } from '../../components/messages/NewThreadModal'
import { LinkifiedText } from '../../components/messages/LinkifiedText'
import { MessageActionsMenu } from '../../components/messages/MessageActionsMenu'
import { ReportMessageModal } from '../../components/messages/ReportMessageModal'
import {
  MESSAGE_EDIT_WINDOW_MINUTES,
  breederProfileSchema,
  updateBreederProfileSchema,
} from '@patacerta/shared'

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
  // Racas
  breeds?: Array<{
    breed: { id: number; nameSlug: string; namePt: string; fciGroup: string | null }
  }>
  otherBreedsNote?: string | null
}

interface VerificationDoc {
  id: number
  docType: string
  fileName: string
  status: string
}

interface District {
  id: number
  namePt: string
}

interface Municipality {
  id: number
  namePt: string
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
  } | null
  service: {
    id: number
    title: string
    provider: ThreadUser
  } | null
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
  } | null
  service: {
    id: number
    title: string
    status: string
    provider: ThreadUser
  } | null
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

  const { data: districts } = useQuery<District[]>({
    queryKey: ['districts'],
    queryFn: () => api.get('/search/districts').then((r) => r.data),
  })

  const { data: breedsCatalog } = useQuery<
    Array<{ id: number; nameSlug: string; namePt: string; fciGroup: string | null }>
  >({
    queryKey: ['breeds'],
    queryFn: () => api.get('/breeds').then((r) => r.data),
    staleTime: 60 * 60 * 1000,
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
    breedIds: [] as number[],
    hasOtherBreeds: false,
    otherBreedsNote: '',
  })
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Sem perfil ainda? Abre directamente em modo "criar" (form aberto).
  // Ja tem perfil? Mostra a vista de status; o utilizador clica "Editar"
  // para entrar no formulario.
  useEffect(() => {
    if (!isLoading && !breeder) {
      setEditing(true)
    }
  }, [isLoading, breeder])

  const [uploadDocType, setUploadDocType] = useState('DGAV')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  // Galeria do criador
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoMsg, setPhotoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const MAX_BREEDER_PHOTOS = 10

  // Modo "criar perfil" — fotos e DGAV são submetidos no mesmo fluxo
  // do formulário (single submit). Capturamos os ficheiros aqui para
  // depois fazer upload sequencial após criar o breeder.
  const pendingPhotosRef = useRef<HTMLInputElement>(null)
  const pendingDgavRef = useRef<HTMLInputElement>(null)
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [pendingDgavFile, setPendingDgavFile] = useState<File | null>(null)
  // URLs de preview para as fotos pendentes. Geridos via useEffect para
  // garantir cleanup (URL.revokeObjectURL) e evitar memory leaks.
  const [pendingPhotoUrls, setPendingPhotoUrls] = useState<string[]>([])
  // IDs das fotos cuja miniatura já carregou no <img> — usado para
  // mostrar spinner por foto enquanto o browser processa.
  const [loadedThumbs, setLoadedThumbs] = useState<Set<number>>(new Set())

  useEffect(() => {
    const urls = pendingPhotos.map((f) => URL.createObjectURL(f))
    setPendingPhotoUrls(urls)
    setLoadedThumbs(new Set())
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [pendingPhotos])

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
        breedIds: (breeder.breeds ?? []).map((b) => b.breed.id),
        hasOtherBreeds: Boolean(
          breeder.otherBreedsNote && breeder.otherBreedsNote.trim().length > 0,
        ),
        otherBreedsNote: breeder.otherBreedsNote ?? '',
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
    // Cria ou actualiza consoante ja existir perfil. O endpoint POST /breeders
    // valida com breederProfileSchema (mais estrito); PATCH /breeders/me usa
    // updateBreederProfileSchema (parcial).
    mutationFn: (data: Record<string, unknown>) =>
      breeder ? api.patch('/breeders/me', data) : api.post('/breeders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
      queryClient.invalidateQueries({ queryKey: ['breeder-profile-probe'] })
      setEditing(false)
      setMsg({
        type: 'success',
        text: breeder
          ? 'Perfil de criador atualizado com sucesso.'
          : 'Perfil de criador criado com sucesso. Adicione documentos para verificacao.',
      })
    },
    onError: (err) => {
      setMsg({
        type: 'error',
        text: extractApiError(
          err,
          breeder ? 'Erro ao atualizar perfil de criador.' : 'Erro ao criar perfil de criador.',
        ),
      })
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
      setMsg({ type: 'success', text: 'Submetido para verificação com sucesso.' })
    },
    onError: () => {
      setMsg({ type: 'error', text: 'Erro ao submeter para verificação.' })
    },
  })

  // Eliminar perfil de criador (apenas quando status != VERIFIED).
  // Apaga em cascata fotos, documentos, raças, etc; user volta a OWNER.
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteProfileMutation = useMutation({
    mutationFn: () => api.delete('/breeders/me'),
    onSuccess: () => {
      // Refresca user (role mudou) e limpa caches do perfil + probe
      // (a probe controla a presença da tab "Criador").
      queryClient.removeQueries({ queryKey: ['breeder-profile'] })
      queryClient.removeQueries({ queryKey: ['breeder-profile-probe'] })
      queryClient.invalidateQueries({ queryKey: ['breeder-profile-probe'] })
      if (user) {
        // Se o user era BREEDER, baixa para OWNER (server pode ter posto SP — mas
        // mais comum é OWNER). Resync via /auth/me na próxima mount; aqui
        // só ajustamos optimisticamente para refletir UI.
        updateUser({ ...user, role: user.role === 'BREEDER' ? 'OWNER' : user.role })
      }
      setDeleteOpen(false)
      navigate('/area-pessoal')
    },
    onError: (err: unknown) => {
      setDeleteError(extractApiError(err, 'Erro ao eliminar perfil de criador.'))
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
        text: `Máximo ${MAX_BREEDER_PHOTOS} fotos (tem ${existing}).`,
      })
      return
    }
    const fd = new FormData()
    Array.from(files).forEach((f) => fd.append('photos', f))
    uploadPhotosMutation.mutate(fd)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const otherBreedsNote = form.hasOtherBreeds ? form.otherBreedsNote.trim() || null : null
    if (form.breedIds.length === 0 && !otherBreedsNote) {
      setMsg({
        type: 'error',
        text: 'Indique pelo menos uma raça do catálogo ou descreva as raças em "Outras raças".',
      })
      return
    }
    // No modo "criar" os campos abaixo são obrigatórios.
    if (!breeder) {
      const requiredMissing: string[] = []
      if (!form.businessName.trim()) requiredMissing.push('Nome comercial')
      if (!form.nif.trim()) requiredMissing.push('NIF')
      if (!form.dgavNumber.trim()) requiredMissing.push('Número DGAV')
      if (!form.districtId) requiredMissing.push('Distrito')
      if (!form.municipalityId) requiredMissing.push('Concelho')
      if (form.description.trim().length < 80) requiredMissing.push('Apresentação (mín. 80)')
      if (pendingPhotos.length === 0) requiredMissing.push('Pelo menos 1 foto')
      if (!pendingDgavFile) requiredMissing.push('Documento DGAV')
      if (requiredMissing.length > 0) {
        setMsg({
          type: 'error',
          text: `Preencha os campos obrigatórios: ${requiredMissing.join(', ')}.`,
        })
        return
      }
    }

    const payload = {
      businessName: form.businessName.trim(),
      nif: form.nif.trim(),
      dgavNumber: form.dgavNumber.trim(),
      website: form.website.trim() || undefined,
      phone: form.phone.trim() || undefined,
      description: form.description.trim() || undefined,
      districtId: form.districtId ? Number(form.districtId) : undefined,
      municipalityId: form.municipalityId ? Number(form.municipalityId) : undefined,
      youtubeVideoId: form.youtubeVideoId.trim() || undefined,
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
      deliveryByPlane: false,
      pickupNotes: form.pickupNotes.trim() || undefined,
      breedIds: form.breedIds,
      otherBreedsNote: otherBreedsNote ?? undefined,
    }

    // Validação completa via schema partilhado (consistente com backend).
    // Em modo "criar" usamos o estrito; em "editar" o parcial.
    const schema = breeder ? updateBreederProfileSchema : breederProfileSchema
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      setMsg({ type: 'error', text: parsed.error.errors[0].message })
      return
    }

    // O endpoint actual aceita null para "limpar" certos campos. Mantemos a
    // forma do payload existente (com null em vez de undefined) para compat.
    const finalPayload = {
      ...parsed.data,
      description: form.description,
      website: form.website,
      phone: form.phone,
      youtubeVideoId: form.youtubeVideoId,
      pickupNotes: form.pickupNotes,
      districtId: form.districtId ? Number(form.districtId) : null,
      municipalityId: form.municipalityId ? Number(form.municipalityId) : null,
      breedIds: form.breedIds,
      otherBreedsNote,
    }

    if (!breeder) {
      // Fluxo "criar perfil" — cria breeder, depois faz upload sequencial
      // das fotos e do documento DGAV. Tudo dentro do mesmo submit.
      try {
        await saveMutation.mutateAsync(finalPayload)
        // Upload fotos
        if (pendingPhotos.length > 0) {
          const fd = new FormData()
          pendingPhotos.forEach((f) => fd.append('photos', f))
          await api.post('/breeders/me/photos', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        }
        // Upload DGAV
        if (pendingDgavFile) {
          const fd = new FormData()
          fd.append('file', pendingDgavFile)
          fd.append('docType', 'DGAV')
          await api.post('/verification/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        }
        // Limpa estado pendente e refresca cache para aparecer galeria/docs
        setPendingPhotos([])
        setPendingDgavFile(null)
        if (pendingPhotosRef.current) pendingPhotosRef.current.value = ''
        if (pendingDgavRef.current) pendingDgavRef.current.value = ''
        queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
        setMsg({
          type: 'success',
          text: 'Perfil criado com fotos e documento DGAV. Pode agora submeter para verificação.',
        })
      } catch (err) {
        setMsg({
          type: 'error',
          text: extractApiError(err, 'Erro ao criar perfil ou enviar ficheiros.'),
        })
      }
      return
    }

    saveMutation.mutate(finalPayload)
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  // Sem perfil de criador ainda — entramos directos em modo "criar".
  // O resto do tab (Status, Galeria, Documentos, Eliminar) so aparece
  // depois do perfil ser criado.
  const noProfile = !breeder

  const docTypeOptions = [{ value: 'DGAV', label: 'DGAV (obrigatório)' }]

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

  // Quando o criador ainda não está verificado (DRAFT, PENDING_VERIFICATION
  // ou SUSPENDED), todo o conteúdo de gestão (galeria + documentos) é
  // colapsado para dentro do modo Editar para reduzir clutter na vista
  // pública do dashboard. Adicionamos um botão Eliminar ao lado do
  // Editar nesses estados.
  const isUnverified = breeder ? breeder.status !== 'VERIFIED' : true

  // Galeria + Documentos extraídos para variáveis para que possam ser
  // renderizados ou fora dos cards (status VERIFIED) ou dentro do
  // formulário Editar (status não-verificado).
  const galeriaSection = breeder ? (
    <PhotoGalleryManager
      photos={breeder.photos ?? []}
      max={MAX_BREEDER_PHOTOS}
      title="Galeria do criador"
      emptyHint="Ainda não adicionou fotos. Mostre as suas instalações, cuidados, ambiente."
      onUpload={handleUploadPhotos}
      uploadInputRef={photoInputRef}
      isUploading={uploadPhotosMutation.isPending}
      uploadMsg={photoMsg}
      onDelete={(photoId: number) => deletePhotoMutation.mutate(photoId)}
      onReorder={(photoIds: number[]) => reorderPhotosMutation.mutate(photoIds)}
      wrapInCard={false}
      showHeader={false}
    />
  ) : null

  const isVerifiedBreeder = breeder?.status === 'VERIFIED'
  const hasDgavDocAlready = breeder?.verificationDocs.some((d) => d.docType === 'DGAV') ?? false
  const dgavLocked = isVerifiedBreeder
  const canUploadMoreDocs = !hasDgavDocAlready

  const documentosSection = breeder ? (
    <div>
      {breeder.verificationDocs.length > 0 ? (
        <div className="space-y-3 mb-6">
          {breeder.verificationDocs.map((doc) => {
            const isDgav = doc.docType === 'DGAV'
            // O DGAV so pode ser eliminado em PENDING e enquanto o perfil
            // ainda nao esta verificado. Apos verificacao fica trancado
            // permanentemente para evitar reutilizacao em outros perfis.
            const canDelete = doc.status === 'PENDING' && !(isDgav && dgavLocked)
            return (
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
                  {canDelete && (
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
            )
          })}
        </div>
      ) : (
        <p className="mb-6 text-sm text-gray-500">
          Nenhum documento enviado. É obrigatório enviar o certificado DGAV.
        </p>
      )}

      {/* Upload — escondido quando ja existe um DGAV (so se permite 1) ou
          quando o perfil ja esta verificado. */}
      {canUploadMoreDocs && !dgavLocked ? (
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
      ) : dgavLocked ? (
        <p className="text-xs text-muted">
          O certificado DGAV está trancado após verificação do perfil. Para o substituir contacte o
          suporte.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Para enviar um novo certificado DGAV, elimine primeiro o atual (apenas possível enquanto
          estiver pendente).
        </p>
      )}
      {uploadMsg && (
        <p
          className={`mt-2 text-sm ${uploadMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
        >
          {uploadMsg.text}
        </p>
      )}
    </div>
  ) : null

  const hasDgavDoc = breeder?.verificationDocs.some((d) => d.docType === 'DGAV') ?? false

  const submitVerificationButton =
    breeder && breeder.status === 'DRAFT' && breeder.verificationDocs.length > 0 ? (
      <div className="flex flex-col items-end gap-1">
        <Button
          loading={submitVerificationMutation.isPending}
          disabled={!hasDgavDoc}
          onClick={() => submitVerificationMutation.mutate()}
        >
          Submeter para verificação
        </Button>
        {!hasDgavDoc && (
          <p className="text-xs text-red-600">
            É necessário enviar o certificado DGAV antes de submeter.
          </p>
        )}
      </div>
    ) : null

  // ── Form do criador (acordeao com seccoes) ─────────────────────────
  // Reutilizado tanto em modo "criar" (sem perfil ainda) como em "editar".
  const breederForm = (
    <form onSubmit={handleSave} className="space-y-4">
      <Accordion>
        {/* Galeria — primeira seccao do form em modo edit. As fotos sao
            o primeiro contacto visual com o criador, por isso ficam no
            topo. Em "criar" usa-se o uploader simples mais abaixo. */}
        {!noProfile && breeder && (
          <AccordionSection
            title={`Galeria do criador (${breeder.photos?.length ?? 0}/${MAX_BREEDER_PHOTOS})`}
            eyebrow="Apresentação visual *"
            defaultOpen
          >
            {galeriaSection}
          </AccordionSection>
        )}
        {/* Certificado DGAV — segunda seccao em modo edit, pelo papel
            critico que tem na verificacao do perfil. */}
        {!noProfile && breeder && (
          <AccordionSection title="Certificado DGAV" eyebrow="Documento obrigatório *" defaultOpen>
            {documentosSection}
          </AccordionSection>
        )}
        {noProfile && (
          <AccordionSection title="Fotos do canil" eyebrow="Apresentação visual *" defaultOpen>
            <p className="mb-3 text-xs text-gray-600">
              Comece por escolher pelo menos uma foto — pode continuar a preencher o formulário
              enquanto o browser processa as miniaturas. Pode adicionar até {MAX_BREEDER_PHOTOS}{' '}
              fotos. Formatos aceites: JPG, PNG, WebP.
            </p>
            <input
              ref={pendingPhotosRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : []
                setPendingPhotos(files.slice(0, MAX_BREEDER_PHOTOS))
              }}
              className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-caramel-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-caramel-700 hover:file:bg-caramel-100"
            />
            {pendingPhotos.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {pendingPhotos.map((file, idx) => {
                  const url = pendingPhotoUrls[idx]
                  const isLoaded = loadedThumbs.has(idx)
                  return (
                    <div
                      key={`${file.name}-${idx}`}
                      className="relative aspect-square overflow-hidden border border-line bg-cream-50"
                      style={{ borderRadius: 2 }}
                    >
                      {!isLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-cream-50">
                          <Spinner size="sm" />
                        </div>
                      )}
                      {url && (
                        <img
                          src={url}
                          alt={file.name}
                          className={`h-full w-full object-cover transition-opacity ${
                            isLoaded ? 'opacity-100' : 'opacity-0'
                          }`}
                          onLoad={() =>
                            setLoadedThumbs((prev) => {
                              const next = new Set(prev)
                              next.add(idx)
                              return next
                            })
                          }
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setPendingPhotos((prev) => prev.filter((_, i) => i !== idx))
                        }}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                        aria-label={`Remover ${file.name}`}
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                        {file.name}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Nenhuma foto seleccionada (mín. 1).</p>
            )}
            {pendingPhotos.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                {pendingPhotos.length}/{MAX_BREEDER_PHOTOS} foto(s) seleccionada(s) ·{' '}
                {loadedThumbs.size === pendingPhotos.length
                  ? 'pré-visualizações prontas'
                  : `a processar ${pendingPhotos.length - loadedThumbs.size}…`}
              </p>
            )}
          </AccordionSection>
        )}

        {noProfile && (
          <AccordionSection title="Documento DGAV" eyebrow="Verificação *" defaultOpen>
            <p className="mb-3 text-xs text-gray-600">
              Envie o seu certificado DGAV. Este documento é obrigatório para submeter o perfil para
              verificação. Formatos aceites: PDF, JPG, PNG.
            </p>
            <input
              ref={pendingDgavRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setPendingDgavFile(file)
              }}
              className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-caramel-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-caramel-700 hover:file:bg-caramel-100"
            />
            <p className="mt-2 text-xs text-gray-500">
              {pendingDgavFile
                ? `Ficheiro: ${pendingDgavFile.name}`
                : 'Nenhum ficheiro seleccionado.'}
            </p>
          </AccordionSection>
        )}

        <AccordionSection title="Identificação" eyebrow="Dados oficiais" defaultOpen>
          <div className="space-y-4">
            <Input
              label="Nome comercial / canil"
              value={form.businessName}
              onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
              disabled={isLocked}
              required={noProfile}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="NIF"
                value={form.nif}
                onChange={(e) => setForm((p) => ({ ...p, nif: e.target.value }))}
                disabled={isLocked}
                placeholder="9 dígitos"
                required={noProfile}
              />
              <Input
                label="Número DGAV"
                value={form.dgavNumber}
                onChange={(e) => setForm((p) => ({ ...p, dgavNumber: e.target.value }))}
                disabled={isLocked}
                required={noProfile}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Website"
                placeholder="https://"
                value={form.website}
                onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
              />
              <Input
                label="Telefone"
                placeholder="+351 912 345 678"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                type="tel"
              />
            </div>
            <div>
              <label className="label">Apresentação{noProfile ? ' *' : ''}</label>
              <textarea
                className="input min-h-[100px]"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Conte-nos sobre o seu canil — experiência, filosofia, raças, instalações… (mín. 80 caracteres)"
                maxLength={2000}
                required={noProfile}
              />
              <p
                className={`mt-1 text-right text-xs ${
                  form.description.length === 0
                    ? 'text-gray-400'
                    : form.description.length < 80
                      ? 'text-amber-600'
                      : form.description.length > 1800
                        ? 'text-orange-600'
                        : 'text-gray-400'
                }`}
              >
                {form.description.length === 0 ? (
                  <>0/2000 (mín. 80)</>
                ) : form.description.length < 80 ? (
                  <>
                    {form.description.length}/2000 — faltam {80 - form.description.length}{' '}
                    caracteres
                  </>
                ) : (
                  <>{form.description.length}/2000</>
                )}
              </p>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection title="Localização" eyebrow="Onde está" defaultOpen={noProfile}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Distrito"
              options={(districts ?? []).map((d) => ({ value: String(d.id), label: d.namePt }))}
              placeholder="Selecionar distrito"
              value={form.districtId}
              onChange={(e) =>
                setForm((p) => ({ ...p, districtId: e.target.value, municipalityId: '' }))
              }
              required={noProfile}
            />
            <Select
              label="Concelho"
              options={(municipalities ?? []).map((m) => ({
                value: String(m.id),
                label: m.namePt,
              }))}
              placeholder="Selecionar concelho"
              value={form.municipalityId}
              onChange={(e) => setForm((p) => ({ ...p, municipalityId: e.target.value }))}
              disabled={!form.districtId}
              required={noProfile}
            />
          </div>
        </AccordionSection>

        <AccordionSection title="Raças" eyebrow="O que cria" defaultOpen={noProfile}>
          <p className="mb-3 text-xs text-gray-600">
            Seleccione as raças do catálogo (LOP/CPC). Se trabalha com raças não listadas, pode
            descrevê-las em "Outras raças".
          </p>
          <BreedMultiCombobox
            breeds={breedsCatalog ?? []}
            selectedIds={form.breedIds}
            onChange={(ids) => setForm((prev) => ({ ...prev, breedIds: ids }))}
          />
          <div className="mt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={form.hasOtherBreeds}
                onChange={(e) => setForm((p) => ({ ...p, hasOtherBreeds: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
              />
              Tenho outras raças não listadas
            </label>
            {form.hasOtherBreeds && (
              <textarea
                className="input mt-2 min-h-[80px]"
                value={form.otherBreedsNote}
                onChange={(e) => setForm((p) => ({ ...p, otherBreedsNote: e.target.value }))}
                placeholder="Indique as raças que cria (máx. 500 caracteres)…"
                maxLength={500}
              />
            )}
          </div>
        </AccordionSection>

        <AccordionSection title="Reconhecimentos e inclusões" eyebrow="Credibilidade">
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Reconhecimentos oficiais</h4>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.cpcMember}
                    onChange={(e) => setForm((p) => ({ ...p, cpcMember: e.target.checked }))}
                    className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                  />
                  Membro do CPC (Clube Português de Canicultura)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.fciAffiliated}
                    onChange={(e) => setForm((p) => ({ ...p, fciAffiliated: e.target.checked }))}
                    className="rounded border-gray-300 text-caramel-600 focus:ring-caramel-500"
                  />
                  Filiado FCI (Fédération Cynologique Internationale)
                </label>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                O que está incluído com cada cachorro
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    { key: 'vetCheckup', label: 'Check-up veterinário' },
                    { key: 'microchip', label: 'Microchip implantado' },
                    { key: 'vaccinations', label: 'Vacinação em dia' },
                    { key: 'lopRegistry', label: 'Registo no LOP' },
                    { key: 'kennelName', label: 'Nome de canil' },
                    { key: 'salesInvoice', label: 'Factura de venda' },
                    { key: 'food', label: 'Alimentação inicial' },
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

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                Vídeo de apresentação (YouTube)
              </h4>
              <Input
                label="URL ou ID do vídeo"
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.youtubeVideoId}
                onChange={(e) => setForm((p) => ({ ...p, youtubeVideoId: e.target.value }))}
              />
              <p className="mt-1 text-xs text-gray-500">
                Cole o link completo ou apenas o ID. Deixe vazio para remover.
              </p>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection title="Recolha e entrega" eyebrow="Levar para casa">
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
              Entrega ao domicílio
            </label>
          </div>
          <div className="mt-3">
            <label className="label">Notas sobre recolha / entrega</label>
            <textarea
              className="input min-h-[80px]"
              value={form.pickupNotes}
              onChange={(e) => setForm((p) => ({ ...p, pickupNotes: e.target.value }))}
              placeholder="Custos, condições, zonas cobertas..."
              maxLength={1000}
            />
          </div>
        </AccordionSection>
      </Accordion>

      {msg && (
        <p className={`text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}

      {/* Galeria e Documentos vivem no topo do Accordion em modo edit;
          aqui em baixo ficam apenas os botoes de accao. */}

      <div className="flex gap-3 border-t border-line pt-4">
        <Button
          type="submit"
          loading={saveMutation.isPending}
          disabled={
            noProfile &&
            (form.description.trim().length < 80 || pendingPhotos.length === 0 || !pendingDgavFile)
          }
        >
          {noProfile ? 'Criar perfil' : 'Guardar'}
        </Button>
        {!noProfile && (
          <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )

  return (
    <div className="space-y-6">
      {/* Header — modo criar */}
      {noProfile && (
        <Card hover={false}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-caramel-500">
            <span>◆</span>
            <span className="italic">Tornar-me criador</span>
          </div>
          <h2 className="mt-1 font-serif text-2xl text-ink">Criar perfil de criador</h2>
          <p className="mt-2 text-sm text-muted">
            Preencha os campos abaixo para criar o seu perfil. A apresentação, pelo menos uma foto e
            o documento DGAV são obrigatórios. Após criar, poderá submeter para verificação.
          </p>
        </Card>
      )}

      {/* Status — apenas quando ja existe perfil. Card unico com
          sub-seccoes: Estado, Form (quando editar), Galeria, Documentos.
          Tudo agrupado dentro do tab Criador para coerencia visual. */}
      {breeder && (
        <Card hover={false}>
          {/* Estado + accoes */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Estado do criador</h3>
              <div className="mt-2">
                <VerificationBadge status={breeder.status} />
              </div>
            </div>
            {!editing && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Editar
                </Button>
                {isUnverified && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDeleteError(null)
                      setDeleteOpen(true)
                    }}
                  >
                    Eliminar
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Form (apenas em modo editar) — inclui ja Galeria + Documentos
              integrados, com Guardar/Cancelar no fim de tudo. */}
          {editing && <div className="mt-6 border-t border-line pt-6">{breederForm}</div>}

          {/* Submit para verificacao — so visivel quando NAO esta a editar
              para nao competir visualmente com Guardar/Cancelar. */}
          {!editing && submitVerificationButton && (
            <div className="mt-6 border-t border-line pt-6 flex justify-end">
              {submitVerificationButton}
            </div>
          )}

          {!editing && msg && (
            <p
              className={`mt-4 text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
            >
              {msg.text}
            </p>
          )}
        </Card>
      )}

      {/* Modo criar (sem perfil) — form sozinho num card */}
      {noProfile && <Card hover={false}>{breederForm}</Card>}

      {/* Modal — confirmação de eliminação do perfil de criador */}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar perfil de criador"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Tem a certeza que pretende eliminar o seu perfil de criador? Esta acção é{' '}
            <strong className="text-red-600">irreversível</strong> e vai apagar:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Todos os dados do perfil ({breeder?.businessName ?? '—'})</li>
            <li>Galeria ({breeder?.photos?.length ?? 0} foto(s))</li>
            <li>Documentos de verificação ({breeder?.verificationDocs.length ?? 0})</li>
            <li>Raças associadas</li>
            <li>Conversas e mensagens recebidas</li>
            <li>Avaliações recebidas</li>
          </ul>
          <p className="text-xs text-muted">
            A sua conta de utilizador é mantida — pode voltar a criar um perfil de criador no
            futuro.
          </p>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteProfileMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteProfileMutation.isPending}
              onClick={() => deleteProfileMutation.mutate()}
            >
              Eliminar definitivamente
            </Button>
          </div>
        </div>
      </Modal>
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
      breeder: { id: number; businessName: string } | null
      service: { id: number; title: string } | null
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

    const counterpartyName = threadDetail.breeder
      ? threadDetail.breeder.businessName
      : threadDetail.service
        ? threadDetail.service.title
        : 'Conversa'
    const otherParty =
      user && threadDetail.owner.id === user.id
        ? {
            name: counterpartyName,
            avatarName: counterpartyName,
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
                ? hit.thread.breeder
                  ? hit.thread.breeder.businessName
                  : (hit.thread.service?.title ?? 'Conversa')
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
              ? thread.breeder
                ? thread.breeder.businessName
                : (thread.service?.title ?? 'Conversa')
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
  // Tab "Criador" aparece para qualquer non-admin: serve tanto para gerir
  // o perfil existente como para o criar (entra direto em modo formulario).
  const showBreederTab = !!user && user.role !== 'ADMIN'
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
    ...(showBreederTab
      ? [
          {
            id: 'criador',
            label: hasBreederProfile ? 'Criador' : 'Tornar-me criador',
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
      label: 'Minhas avaliações',
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
      content: <MyReviewsTab />,
    },
    ...(isBreeder || hasServices
      ? [
          {
            id: 'avaliacoes-recebidas',
            label: 'Avaliações sobre mim',
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
            content: (
              <ReceivedReviewsTab includeBreeder={isBreeder} includeServices={hasServices} />
            ),
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
        <h1 className="page-title">Área pessoal</h1>
        <p className="page-subtitle">Gerir o seu perfil, mensagens e definições.</p>
      </div>

      <Tabs tabs={tabs} defaultTab={defaultTab} />
    </div>
  )
}
