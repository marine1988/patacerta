import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { RegisterInput, LoginInput } from '@patacerta/shared'

// ---- Types ----

export interface User {
  id: number
  email: string
  role: string
  firstName: string
  lastName: string
}

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (data: LoginInput) => Promise<User>
  register: (data: RegisterInput) => Promise<{ message: string; email: string }>
  logout: () => void
  updateUser: (user: User) => void
}

// ---- Context ----

const AuthContext = createContext<AuthContextValue | null>(null)

// B-05: Check if a JWT is expired by decoding the payload
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
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
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
    return u
  }, [])

  const register = useCallback(
    async (data: RegisterInput): Promise<{ message: string; email: string }> => {
      const res = await api.post('/auth/register', data)
      return res.data as { message: string; email: string }
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
  }, [])

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
