import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import { useAuth } from '../../hooks/useAuth'
import { useBreeds, useDistricts, useMunicipalities } from '../../lib/useLookups'
import {
  Card,
  Badge,
  Button,
  Input,
  Select,
  Spinner,
  Modal,
  Accordion,
  AccordionSection,
} from '../../components/ui'
import { VerificationBadge } from '../../components/shared/VerificationBadge'
import { PhotoGalleryManager } from '../../components/shared/PhotoGalleryManager'
import { BreedMultiCombobox } from '../../components/shared/BreedMultiCombobox'
import { breederProfileSchema, updateBreederProfileSchema } from '@patacerta/shared'
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

export function BreederTab() {
  const queryClient = useQueryClient()

  const { data: breeder, isLoading } = useQuery<BreederProfile>({
    queryKey: ['breeder-profile'],
    queryFn: () => api.get('/breeders/me/profile').then((r) => r.data),
  })

  const { data: districts } = useDistricts()

  const { data: breedsCatalog } = useBreeds()

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

  const { data: municipalities } = useMunicipalities(form.districtId)

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

  // â”€â”€ Form do criador (acordeao com seccoes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                {pendingPhotos.length}/{MAX_BREEDER_PHOTOS} foto(s) seleccionada(s) Â·{' '}
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
            <span>â—†</span>
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ MessagesTab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
