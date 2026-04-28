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

  // B-05: Hydrate from localStorage on mount — verify token is not expired
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
    } else if (token && stored && isTokenExpired(token)) {
      // Token expired — try refreshing
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken && !isTokenExpired(refreshToken)) {
        api
          .post('/auth/refresh', { refreshToken })
          .then(({ data }) => {
            localStorage.setItem('access_token', data.accessToken)
            localStorage.setItem('refresh_token', data.refreshToken)
            try {
              setUser(JSON.parse(stored))
            } catch {
              localStorage.removeItem('user')
            }
          })
          .catch(() => {
            // Refresh failed — clear everything
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            localStorage.removeItem('user')
          })
          .finally(() => setIsLoading(false))
      } else {
        // No valid refresh token — clear stale data
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        setIsLoading(false)
      }
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (data: LoginInput): Promise<User> => {
    const res = await api.post('/auth/login', data)
    const { user: u, accessToken, refreshToken } = res.data
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
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
    // We fire-and-forget: even if the request fails (offline, expired token),
    // we still clear local state so the UI logs the user out immediately.
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }).catch(() => {
        /* swallowed: logout must not fail client-side */
      })
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
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
