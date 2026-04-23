import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { forgotPasswordSchema, resetPasswordSchema } from '@patacerta/shared'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  // If there's a token in the URL, show the "set new password" form
  // Otherwise show the "request reset" form
  return token ? <SetNewPasswordForm token={token} /> : <RequestResetForm />
}

function RequestResetForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const result = forgotPasswordSchema.safeParse({ email })
    if (!result.success) {
      setError(result.error.errors[0].message)
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/forgot-password', result.data)
      setSuccess(true)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error || 'Erro ao processar o pedido')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Card>
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Email enviado</h2>
              <p className="text-sm text-gray-600 mb-4">
                Se o email existir na nossa plataforma, receberá instruções para repor a palavra-passe.
              </p>
              <Link
                to="/entrar"
                className="text-sm font-medium text-caramel-600 hover:text-caramel-500"
              >
                Voltar ao login
              </Link>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Recuperar palavra-passe</h1>
          <p className="mt-2 text-sm text-gray-600">
            Introduza o email associado à sua conta e enviaremos instruções para repor a palavra-passe.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.pt"
              required
              autoComplete="email"
            />

            <Button type="submit" loading={loading} className="w-full">
              Enviar instruções
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-gray-600">
          <Link to="/entrar" className="font-medium text-caramel-600 hover:text-caramel-500">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}

function SetNewPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('As palavras-passe não coincidem')
      return
    }

    const result = resetPasswordSchema.safeParse({ token, password })
    if (!result.success) {
      setError(result.error.errors[0].message)
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', result.data)
      setSuccess(true)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error || 'Erro ao repor a palavra-passe')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Card>
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Palavra-passe atualizada
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                A sua palavra-passe foi reposta com sucesso. Pode agora iniciar sessão.
              </p>
              <Link
                to="/entrar"
                className="inline-flex items-center rounded-lg bg-caramel-600 px-4 py-2 text-sm font-medium text-white hover:bg-caramel-700"
              >
                Ir para o login
              </Link>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Nova palavra-passe</h1>
          <p className="mt-2 text-sm text-gray-600">
            Introduza a sua nova palavra-passe.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <Input
              label="Nova palavra-passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />

            <Input
              label="Confirmar palavra-passe"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />

            <p className="text-xs text-gray-500">
              Mínimo 8 caracteres, com maiúscula, minúscula e número.
            </p>

            <Button type="submit" loading={loading} className="w-full">
              Repor palavra-passe
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
