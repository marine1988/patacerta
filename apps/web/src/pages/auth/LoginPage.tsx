import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { loginSchema } from '@patacerta/shared'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNeedsVerification(false)

    const result = loginSchema.safeParse({ email, password })
    if (!result.success) {
      setError(result.error.errors[0].message)
      return
    }

    setLoading(true)
    try {
      await login(result.data)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; code?: string } } }
      const code = axiosErr.response?.data?.code
      setError(axiosErr.response?.data?.error || 'Erro ao iniciar sessão')
      if (code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Entrar na PataCerta</h1>
          <p className="mt-2 text-sm text-gray-600">
            Ainda não tem conta?{' '}
            <Link to="/registar" className="font-medium text-primary-600 hover:text-primary-500">
              Registar
            </Link>
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
                {needsVerification && (
                  <div className="mt-2">
                    <Link
                      to={`/verificar-email?email=${encodeURIComponent(email)}`}
                      className="font-medium text-primary-600 hover:text-primary-500"
                    >
                      Reenviar email de verificação →
                    </Link>
                  </div>
                )}
              </div>
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

            <Input
              label="Palavra-passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <Button type="submit" loading={loading} className="w-full">
              Entrar
            </Button>

            <p className="text-center text-sm text-gray-600">
              <Link
                to="/recuperar-palavra-passe"
                className="font-medium text-primary-600 hover:text-primary-500"
              >
                Esqueceu a palavra-passe?
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}
