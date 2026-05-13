import { useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import { useAuth } from '../../hooks/useAuth'
import { Card, Button, Modal, Input } from '../../components/ui'
export function SettingsTab() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [notifyMessages, setNotifyMessages] = useState(
    () => localStorage.getItem('notify_messages') !== 'false',
  )
  const [notifyVerification, setNotifyVerification] = useState(
    () => localStorage.getItem('notify_verification') !== 'false',
  )
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

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
    onError: (err) => {
      setDeleteError(extractApiError(err, 'Erro ao eliminar conta. Tente novamente.'))
    },
  })

  async function handleExport() {
    setExportError(null)
    try {
      const { data } = await api.get('/users/me')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dados-${user?.email ?? 'utilizador'}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(extractApiError(err, 'Erro ao exportar dados. Tente novamente.'))
    }
  }

  const canConfirmDelete = deleteConfirmText.trim().toUpperCase() === 'ELIMINAR'

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
          <Button
            variant="danger"
            onClick={() => {
              setDeleteConfirmText('')
              setDeleteError(null)
              setShowDeleteModal(true)
            }}
          >
            Eliminar conta
          </Button>
        </div>
        {exportError && <p className="mt-3 text-sm text-red-600">{exportError}</p>}
      </Card>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (deleteMutation.isPending) return
          setShowDeleteModal(false)
          setDeleteConfirmText('')
          setDeleteError(null)
        }}
        title="Eliminar conta"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Esta acção desactiva a sua conta e anonimiza os seus dados pessoais (nome, email,
            telefone) de forma irreversível, em conformidade com o RGPD. Não poderá voltar a iniciar
            sessão com este email.
          </p>
          <p className="text-sm text-gray-600">
            Para confirmar, escreva <strong>ELIMINAR</strong> em maiúsculas no campo abaixo:
          </p>
          <Input
            label="Confirmação"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="ELIMINAR"
            autoFocus
          />
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setShowDeleteModal(false)
              setDeleteConfirmText('')
              setDeleteError(null)
            }}
            disabled={deleteMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            disabled={!canConfirmDelete}
            onClick={() => {
              setDeleteError(null)
              deleteMutation.mutate()
            }}
          >
            Eliminar definitivamente
          </Button>
        </div>
      </Modal>
    </div>
  )
}
