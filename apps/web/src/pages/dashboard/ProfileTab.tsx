import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { Card, Avatar, Badge, Button, Input, useConfirm } from '../../components/ui'
import { extractApiError } from '../../lib/errors'
import { validatePassword } from '../../lib/validation'
export function ProfileTab() {
  const { user, updateUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarMsg, setAvatarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )
  const [confirm, confirmDialog] = useConfirm()

  async function handleRemoveAvatar() {
    const ok = await confirm({
      title: 'Remover avatar',
      message: 'Remover o seu avatar? Voltará a ver as iniciais do seu nome.',
      confirmLabel: 'Remover',
      variant: 'danger',
    })
    if (!ok) return
    setAvatarMsg(null)
    avatarDeleteMutation.mutate()
  }

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName)
      setLastName(user.lastName)
      setPhone(user.phone ?? '')
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
    onError: (err) => {
      setProfileMsg({ type: 'error', text: extractApiError(err, 'Erro ao atualizar perfil.') })
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.patch('/users/me', data),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwMsg({ type: 'success', text: 'Palavra-passe alterada com sucesso.' })
    },
    onError: (err) => {
      setPwMsg({
        type: 'error',
        text: extractApiError(
          err,
          'Erro ao alterar palavra-passe. Verifique a palavra-passe atual.',
        ),
      })
    },
  })

  const avatarUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    onSuccess: (data) => {
      updateUser(data)
      setAvatarMsg({ type: 'success', text: 'Avatar atualizado.' })
    },
    onError: (err) => {
      setAvatarMsg({ type: 'error', text: extractApiError(err, 'Erro ao carregar avatar.') })
    },
  })

  const avatarDeleteMutation = useMutation({
    mutationFn: () => api.delete('/users/me/avatar'),
    onSuccess: () => {
      updateUser({ ...user!, avatarUrl: null })
      setAvatarMsg({ type: 'success', text: 'Avatar removido.' })
    },
    onError: (err) => {
      setAvatarMsg({ type: 'error', text: extractApiError(err, 'Erro ao remover avatar.') })
    },
  })

  function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset input para permitir re-selecionar o mesmo ficheiro
    e.target.value = ''
    if (!file) return
    setAvatarMsg(null)
    // Validacao client-side (defesa em profundidade; backend valida tambem)
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMsg({ type: 'error', text: 'O ficheiro excede 2MB.' })
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarMsg({ type: 'error', text: 'Formato inválido. Use JPG, PNG ou WebP.' })
      return
    }
    avatarUploadMutation.mutate(file)
  }

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
    // Politica unificada com registo/reset (lib/validation.ts).
    // Sem isto, o change-password client-side aceitava passwords mais fracas
    // do que o registo (apenas length >= 8) — o backend ainda enforces via
    // passwordSchema, mas a UX era ma' (mensagem generica pos-submit).
    const pwErr = validatePassword(newPassword)
    if (pwErr) {
      setPwMsg({ type: 'error', text: pwErr })
      return
    }
    passwordMutation.mutate({ currentPassword, newPassword })
  }

  if (!user) return null

  const roleBadgeVariant =
    user.role === 'BREEDER' ? 'green' : user.role === 'ADMIN' ? 'blue' : 'gray'
  const roleLabel =
    user.role === 'BREEDER' ? 'Criador' : user.role === 'ADMIN' ? 'Administrador' : 'Utilizador'

  return (
    <div className="space-y-6">
      <Card hover={false}>
        {/* Header: avatar | nome+email+badge+acoes avatar | botao editar
            Alinhamento start em vez de center para que os botoes do avatar
            (Alterar/Remover) nao "empurrem" verticalmente o nome — o nome
            fica colado ao topo do avatar e os controlos cabem por baixo
            sem desalinhamento. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Coluna avatar */}
          <div className="flex shrink-0 justify-center sm:justify-start">
            <Avatar
              name={`${user.firstName} ${user.lastName}`}
              imageUrl={user.avatarUrl ?? undefined}
              size="xl"
            />
          </div>

          {/* Coluna identidade + acoes avatar */}
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold text-gray-900">
              {user.firstName} {user.lastName}
            </h2>
            <p className="truncate text-sm text-gray-500">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Badge variant={roleBadgeVariant}>{roleLabel}</Badge>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarPick}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => avatarInputRef.current?.click()}
                loading={avatarUploadMutation.isPending}
              >
                {user.avatarUrl ? 'Alterar foto' : 'Carregar foto'}
              </Button>
              {user.avatarUrl && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  loading={avatarDeleteMutation.isPending}
                >
                  Remover
                </Button>
              )}
            </div>
            {avatarMsg && (
              <p
                className={`mt-2 text-xs ${avatarMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
                role={avatarMsg.type === 'error' ? 'alert' : undefined}
              >
                {avatarMsg.text}
              </p>
            )}
          </div>

          {/* Coluna accao */}
          {!editing && (
            <div className="flex justify-center sm:justify-end">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Editar perfil
              </Button>
            </div>
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
              inputMode="tel"
              pattern="^[+0-9 ()\-]{7,20}$"
              title="Apenas dígitos, espaços, parênteses, + ou -. Mínimo 7 caracteres."
            />
            {profileMsg && (
              <p
                role={profileMsg.type === 'error' ? 'alert' : 'status'}
                aria-live="polite"
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
            role={profileMsg.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
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
              role={pwMsg.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
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
      {confirmDialog}
    </div>
  )
}
