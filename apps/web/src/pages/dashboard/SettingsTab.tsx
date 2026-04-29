import { useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { Card, Button, Modal } from '../../components/ui'
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">NotificaÃ§Ãµes</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Novas mensagens</p>
              <p className="text-xs text-gray-500">
                Receber notificaÃ§Ã£o quando receber uma nova mensagem.
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
              <p className="text-sm font-medium text-gray-900">AtualizaÃ§Ãµes de verificaÃ§Ã£o</p>
              <p className="text-xs text-gray-500">
                Receber notificaÃ§Ã£o sobre o estado da verificaÃ§Ã£o.
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
          Tem a certeza de que deseja eliminar a sua conta? Esta aÃ§Ã£o Ã© irreversÃ­vel e todos os seus
          dados serÃ£o permanentemente apagados.
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
