import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { registerSchema, UserRole } from '@patacerta/shared'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'

const ROLE_OPTIONS = [
  { value: UserRole.OWNER, label: 'Dono de Animal' },
  { value: UserRole.BREEDER, label: 'Criador' },
]

const PASSWORD_HINT = 'Mínimo 8 caracteres, com maiúscula, minúscula e número.'

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Mínimo 8 caracteres.'
  if (!/[A-Z]/.test(pw)) return 'Deve conter pelo menos uma letra maiúscula.'
  if (!/[a-z]/.test(pw)) return 'Deve conter pelo menos uma letra minúscula.'
  if (!/[0-9]/.test(pw)) return 'Deve conter pelo menos um número.'
  return null
}

export function RegisterPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: UserRole.OWNER as string,
    phone: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [successEmail, setSuccessEmail] = useState<string | null>(null)
  const { register } = useAuth()
  const navigate = useNavigate()

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  function handlePasswordBlur() {
    const err = validatePassword(form.password)
    setFieldErrors((prev) => {
      const next = { ...prev }
      if (err) next.password = err
      else delete next.password
      return next
    })
  }

  function handleConfirmPasswordBlur() {
    setFieldErrors((prev) => {
      const next = { ...prev }
      if (form.confirmPassword && form.confirmPassword !== form.password) {
        next.confirmPassword = 'As palavras-passe não coincidem.'
      } else {
        delete next.confirmPassword
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const pwErr = validatePassword(form.password)
    if (pwErr) {
      setFieldErrors((prev) => ({ ...prev, password: pwErr }))
      return
    }

    if (form.password !== form.confirmPassword) {
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: 'As palavras-passe não coincidem.',
      }))
      return
    }

    const { confirmPassword: _cp, ...rest } = form
    const input = { ...rest, phone: form.phone || undefined }
    const parsed = registerSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.errors[0].message)
      return
    }

    setLoading(true)
    try {
      const result = await register(parsed.data)
      setSuccessEmail(result.email)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  if (successEmail) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Conta criada com sucesso</h1>
              <p className="mt-3 text-sm text-gray-600">
                Enviámos um email de verificação para <strong>{successEmail}</strong>. Clique no
                link no email para ativar a sua conta antes de iniciar sessão.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Não recebeu o email? Verifique a pasta de spam ou solicite novo envio na página de
                login.
              </p>
              <div className="mt-6">
                <Button onClick={() => navigate('/entrar')} className="w-full">
                  Ir para login
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Criar conta na PataCerta</h1>
          <p className="mt-2 text-sm text-gray-600">
            Já tem conta?{' '}
            <Link to="/entrar" className="font-medium text-caramel-600 hover:text-caramel-500">
              Entrar
            </Link>
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Nome"
                value={form.firstName}
                onChange={(e) => update('firstName', e.target.value)}
                required
                autoComplete="given-name"
              />
              <Input
                label="Apelido"
                value={form.lastName}
                onChange={(e) => update('lastName', e.target.value)}
                required
                autoComplete="family-name"
              />
            </div>

            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="seu@email.pt"
              required
              autoComplete="email"
            />

            <Input
              label="Palavra-passe"
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              onBlur={handlePasswordBlur}
              required
              autoComplete="new-password"
              hint={PASSWORD_HINT}
              error={fieldErrors.password}
            />

            <Input
              label="Confirmar palavra-passe"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              onBlur={handleConfirmPasswordBlur}
              required
              autoComplete="new-password"
              error={fieldErrors.confirmPassword}
            />

            <Select
              label="Tipo de conta"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
              options={ROLE_OPTIONS}
            />

            <Input
              label="Telemóvel (opcional)"
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+351 912 345 678"
              autoComplete="tel"
            />

            <Button type="submit" loading={loading} className="w-full">
              Criar conta
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
