import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { RegisterInput, LoginInput } from '@patacerta/shared'

// ---- Types ----

export interface User {
  id: number
  email: string
  role: string
  firstName: string
  lastName: string
  phone?: string | null
  avatarUrl?: string | null
}

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (data: LoginInput) => Promise<User>
  register: (data: RegisterInput) => Promise<{ message: string; email: string; verificationSent: boolean }>
  logout: () => void
  updateUser: (user: User) => void
}

// ---- Context ----

const AuthContext = createContext<AuthContextValue | null>(null)

// B-05: Check if a JWT is expired by decoding the payload
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // exp e' uma claim opcional no RFC 7519. Se vier ausente ou com
    // tipo errado tratamos como expirado em vez de NaN < Date.now()
    // (NaN em comparacoes devolve false, o que daria um token "valido
    // para sempre" ao cliente e levaria a 401 silenciosos em loop).
    if (typeof payload?.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return true
    }
    // exp is in seconds, Date.now() is in milliseconds
    // Add 30s buffer so we don't use a token that's about to expire
    return payload.exp * 1000 < Date.now() + 30_000
  } catch {
    return true
  }
}

// ---- Provider ----

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  // Hydrate from localStorage on mount. O refresh token vive em cookie
  // httpOnly e portanto nao e legivel daqui — quando o access token esta
  // expirado pedimos refresh ao servidor que valida o cookie sozinho.
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const stored = localStorage.getItem('user')

    if (token && stored && !isTokenExpired(token)) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem('user')
      }
      setIsLoading(false)
    } else if (stored) {
      // Access token expirado ou ausente, mas temos perfil em cache.
      // Tentamos refresh — se o cookie httpOnly ainda for valido, o
      // servidor devolve novo accessToken. Caso contrario limpamos tudo.
      api
        .post('/auth/refresh', {})
        .then(({ data }) => {
          localStorage.setItem('access_token', data.accessToken)
          try {
            setUser(JSON.parse(stored))
          } catch {
            localStorage.removeItem('user')
          }
        })
        .catch(() => {
          localStorage.removeItem('access_token')
          localStorage.removeItem('user')
          // Sessao morta — limpar cache da sessao anterior.
          queryClient.clear()
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (data: LoginInput): Promise<User> => {
    const res = await api.post('/auth/login', data)
    // O servidor responde com { user, accessToken } e define o cookie
    // refresh_token httpOnly automaticamente.
    const { user: u, accessToken } = res.data
    // Limpar cache antes de aplicar a nova sessao. Cobre o caso raro
    // de login directo (sem logout previo) — ex: dois separadores onde
    // um faz logout e outro tenta autenticar com user diferente.
    queryClient.clear()
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
    return u
  }, [queryClient])

  const register = useCallback(
    async (
      data: RegisterInput,
    ): Promise<{ message: string; email: string; verificationSent: boolean }> => {
      const res = await api.post('/auth/register', data)
      const body = res.data as { message: string; email: string; verificationSent?: boolean }
      // Servidor antigo pode não devolver `verificationSent`; assumir o
      // comportamento default (envia) por segurança — a UI mostra então a
      // mensagem mais informativa "verifique o email".
      return { ...body, verificationSent: body.verificationSent ?? true }
    },
    [],
  )

  const logout = useCallback(() => {
    // Best-effort server-side revocation of the refresh-token rotation chain.
    // O cookie httpOnly e enviado automaticamente pelo browser; o servidor
    // limpa-o e revoga a chain. Fire-and-forget — o UI desliga ja.
    api.post('/auth/logout', {}).catch(() => {
      /* swallowed: logout must not fail client-side */
    })
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
    // Limpa toda a cache React Query. Sem isto, dados do user anterior
    // (ex: ['breeder-profile'], ['threads']) podiam aparecer brevemente
    // ao novo user que faca login na mesma tab, ate cada query revalidar.
    // Equivalente a uma "fronteira de seguranca" entre sessoes.
    queryClient.clear()
  }, [queryClient])

  const updateUser = useCallback((u: User) => {
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ---- Hook ----

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
