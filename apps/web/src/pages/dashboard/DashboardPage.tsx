import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
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

// ──────────────────────────── Types ────────────────────────────

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

interface Thread {
  id: number
  subject: string
  otherPartyName: string
  lastMessage: string
  unreadCount: number
  updatedAt: string
}

interface Message {
  id: number
  senderId: number
  content: string
  createdAt: string
  senderName: string
}

interface ThreadDetail {
  id: number
  subject: string
  otherPartyName: string
  messages: Message[]
}

// ──────────────────────────── ProfileTab ────────────────────────────

function ProfileTab() {
  const { user, updateUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [phone, setPhone] = useState('')
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
      setPwMsg({ type: 'error', text: 'Erro ao alterar palavra-passe. Verifique a palavra-passe atual.' })
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

  const roleBadgeVariant = user.role === 'BREEDER' ? 'green' : user.role === 'ADMIN' ? 'blue' : 'gray'
  const roleLabel = user.role === 'BREEDER' ? 'Criador' : user.role === 'ADMIN' ? 'Administrador' : 'Utilizador'

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
              <p className={`text-sm ${profileMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
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
          <p className={`mt-4 text-sm ${profileMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
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
            <p className={`text-sm ${pwMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
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
  })
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [uploadDocType, setUploadDocType] = useState('NIF')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
      setMsg({ type: 'success', text: 'Submetido para verificação com sucesso.' })
    },
    onError: () => {
      setMsg({ type: 'error', text: 'Erro ao submeter para verificação.' })
    },
  })

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
    return (
      <EmptyState
        title="Perfil de criador não encontrado"
        description="Contacte o suporte se acredita que isto é um erro."
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
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
                options={(municipalities ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
                placeholder="Selecionar município"
                value={form.municipalityId}
                onChange={(e) => setForm((p) => ({ ...p, municipalityId: e.target.value }))}
                disabled={!form.districtId}
              />
            </div>

            {msg && (
              <p className={`text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
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
              className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
            />
          </div>
          <Button type="submit" loading={uploadMutation.isPending}>
            Enviar
          </Button>
        </form>
        {uploadMsg && (
          <p className={`mt-2 text-sm ${uploadMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
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
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')

  const { data: threadsData, isLoading: threadsLoading } = useQuery<{ data: Thread[] }>({
    queryKey: ['threads'],
    queryFn: () => api.get('/messages/threads?page=1&limit=20').then((r) => r.data),
  })

  const threads = threadsData?.data ?? []

  const { data: threadDetail, isLoading: threadLoading } = useQuery<ThreadDetail>({
    queryKey: ['thread', selectedThreadId],
    queryFn: () => api.get(`/messages/threads/${selectedThreadId}`).then((r) => r.data),
    enabled: !!selectedThreadId,
  })

  const markReadMutation = useMutation({
    mutationFn: (threadId: number) => api.patch(`/messages/threads/${threadId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
    },
  })

  const replyMutation = useMutation({
    mutationFn: (data: { threadId: number; content: string }) =>
      api.post(`/messages/threads/${data.threadId}/messages`, { content: data.content }),
    onSuccess: () => {
      setReplyText('')
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
    },
  })

  function openThread(threadId: number) {
    setSelectedThreadId(threadId)
    markReadMutation.mutate(threadId)
  }

  function handleReply(e: FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !selectedThreadId) return
    replyMutation.mutate({ threadId: selectedThreadId, content: replyText.trim() })
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

    if (!threadDetail) {
      return <EmptyState title="Conversa não encontrada" />
    }

    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedThreadId(null)}>
          &larr; Voltar
        </Button>

        <Card hover={false}>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{threadDetail.subject}</h3>
          <p className="text-sm text-gray-500 mb-6">Com: {threadDetail.otherPartyName}</p>

          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {threadDetail.messages.map((msg) => {
              const isOwn = msg.senderId === user?.id
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isOwn
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p
                      className={`text-xs font-medium mb-1 ${
                        isOwn ? 'text-primary-100' : 'text-gray-500'
                      }`}
                    >
                      {msg.senderName}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-xs mt-1 ${
                        isOwn ? 'text-primary-200' : 'text-gray-400'
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleString('pt-PT')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <form onSubmit={handleReply} className="mt-6 flex gap-3">
            <textarea
              className="input flex-1 min-h-[60px]"
              placeholder="Escrever resposta..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              required
            />
            <Button type="submit" loading={replyMutation.isPending}>
              Enviar
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  // Thread list
  if (threads.length === 0) {
    return (
      <EmptyState
        title="Sem mensagens"
        description="Quando contactar ou for contactado por criadores, as mensagens aparecerão aqui."
      />
    )
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => (
        <Card
          key={thread.id}
          hover
          className="cursor-pointer"
          onClick={() => openThread(thread.id)}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                  {thread.subject}
                </h4>
                {thread.unreadCount > 0 && (
                  <Badge variant="blue">{thread.unreadCount}</Badge>
                )}
              </div>
              <p className="text-sm text-gray-500">{thread.otherPartyName}</p>
              <p className="text-sm text-gray-400 truncate">{thread.lastMessage}</p>
            </div>
            <span className="ml-4 shrink-0 text-xs text-gray-400">
              {new Date(thread.updatedAt).toLocaleDateString('pt-PT')}
            </span>
          </div>
        </Card>
      ))}
    </div>
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
              <p className="text-xs text-gray-500">Receber notificação quando receber uma nova mensagem.</p>
            </div>
            <input
              type="checkbox"
              checked={notifyMessages}
              onChange={toggleNotifyMessages}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Atualizações de verificação</p>
              <p className="text-xs text-gray-500">Receber notificação sobre o estado da verificação.</p>
            </div>
            <input
              type="checkbox"
              checked={notifyVerification}
              onChange={toggleNotifyVerification}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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

  const tabParam = searchParams.get('tab') ?? 'profile'
  const isBreeder = user?.role === 'BREEDER'

  const tabs = [
    {
      id: 'profile',
      label: 'Perfil',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
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
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
            ),
            content: <BreederTab />,
          },
        ]
      : []),
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      ),
      content: <MessagesTab />,
    },
    {
      id: 'definicoes',
      label: 'Definições',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
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
