import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'

type Status = 'idle' | 'verifying' | 'success' | 'error'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'idle')
  const [message, setMessage] = useState('')

  // Resend form
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.post('/auth/verify-email', { token })
        if (!cancelled) {
          setStatus('success')
          setMessage(res.data.message || 'Email verificado com sucesso.')
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const axiosErr = err as { response?: { data?: { error?: string } } }
          setStatus('error')
          setMessage(axiosErr.response?.data?.error || 'Não foi possível verificar o email.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleResend(e: React.FormEvent) {
    e.preventDefault()
    setResendMessage('')
    setResendLoading(true)
    try {
      const res = await api.post('/auth/resend-verification', { email: resendEmail })
      setResendMessage(res.data.message || 'Email de verificação reenviado.')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setResendMessage(axiosErr.response?.data?.error || 'Erro ao reenviar email.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card>
          {status === 'verifying' && (
            <div className="text-center">
              <h1 className="text-xl font-bold text-gray-900">A verificar email…</h1>
              <p className="mt-2 text-sm text-gray-600">Aguarde um momento.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Email verificado</h1>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
              <div className="mt-6">
                <Link to="/entrar">
                  <Button className="w-full">Ir para login</Button>
                </Link>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div>
              <div className="mb-4 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-gray-900">Verificação falhou</h1>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
              </div>

              <form onSubmit={handleResend} className="mt-6 space-y-3">
                <p className="text-sm font-medium text-gray-700">Reenviar email de verificação:</p>
                <Input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="seu@email.pt"
                  required
                />
                {resendMessage && (
                  <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                    {resendMessage}
                  </div>
                )}
                <Button type="submit" loading={resendLoading} className="w-full">
                  Reenviar verificação
                </Button>
              </form>
            </div>
          )}

          {status === 'idle' && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 text-center">Verificar email</h1>
              <p className="mt-2 text-sm text-gray-600 text-center">
                Não encontrou o seu email de verificação? Introduza o seu email abaixo para
                receber um novo link.
              </p>

              <form onSubmit={handleResend} className="mt-6 space-y-3">
                <Input
                  label="Email"
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="seu@email.pt"
                  required
                />
                {resendMessage && (
                  <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                    {resendMessage}
                  </div>
                )}
                <Button type="submit" loading={resendLoading} className="w-full">
                  Reenviar verificação
                </Button>
              </form>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
