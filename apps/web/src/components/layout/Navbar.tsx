import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../ui/Avatar'
import { api } from '../../lib/api'

function UnreadBadge({ className = '' }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: async () => {
      const res = await api.get<{ unreadCount: number }>('/messages/unread-count')
      return res.data
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const count = data?.unreadCount ?? 0
  if (count <= 0) return null
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-none text-white ${className}`}
      aria-label={`${count} mensagens não lidas`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function AdminPendingBadge({ className = '' }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ['admin', 'pending-counts'],
    queryFn: async () => {
      const res = await api.get<{
        pendingDocs: number
        pendingBreeders: number
        flaggedReviews: number
        total: number
      }>('/admin/pending-counts')
      return res.data
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const count = data?.total ?? 0
  if (count <= 0) return null
  const title = data
    ? `${data.pendingDocs} documento(s), ${data.pendingBreeders} criador(es) e ${data.flaggedReviews} avaliação(ões) a rever`
    : undefined
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-none text-white ${className}`}
      aria-label={title}
      title={title}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  function isActive(path: string) {
    return location.pathname === path
  }

  const navLinkClass = (path: string) =>
    `text-sm font-medium transition-colors ${
      isActive(path) ? 'text-primary-600' : 'text-gray-600 hover:text-gray-900'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary-600">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 18c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm-4.5-8a2 2 0 100-4 2 2 0 000 4zm9 0a2 2 0 100-4 2 2 0 000 4zM5 13a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
          PataCerta
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          <Link to="/diretorio" className={navLinkClass('/diretorio')}>
            Diretório
          </Link>
          <Link to="/mapa" className={navLinkClass('/mapa')}>
            Mapa
          </Link>

          {isAuthenticated ? (
            <div className="relative flex items-center gap-4">
              <Link
                to="/painel"
                className={`${navLinkClass('/painel')} inline-flex items-center gap-1.5`}
              >
                Painel
                {isAuthenticated && <UnreadBadge />}
              </Link>
              {user?.role === 'ADMIN' && (
                <Link
                  to="/admin"
                  className={`${navLinkClass('/admin')} inline-flex items-center gap-1.5`}
                >
                  Admin
                  <AdminPendingBadge />
                </Link>
              )}
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-1.5">
                <Avatar name={`${user?.firstName} ${user?.lastName}`} size="sm" />
                <span className="text-sm font-medium text-gray-700">{user?.firstName}</span>
                <button
                  onClick={logout}
                  className="text-xs text-gray-400 hover:text-red-500"
                  title="Sair"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/entrar" className="btn-secondary text-sm">
                Entrar
              </Link>
              <Link to="/registar" className="btn-primary text-sm">
                Registar
              </Link>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="btn-icon md:hidden"
          aria-label="Abrir menu"
        >
          {mobileMenuOpen ? (
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-gray-200 bg-white px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-2">
            <Link
              to="/diretorio"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Diretório
            </Link>
            <Link
              to="/mapa"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Mapa
            </Link>

            {isAuthenticated ? (
              <>
                <Link
                  to="/painel"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Painel
                  <UnreadBadge />
                </Link>
                {user?.role === 'ADMIN' && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Admin
                    <AdminPendingBadge />
                  </Link>
                )}
                <div className="border-t border-gray-100 pt-2">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={`${user?.firstName} ${user?.lastName}`} size="sm" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      logout()
                      setMobileMenuOpen(false)
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Sair
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2 border-t border-gray-100 pt-2">
                <Link
                  to="/entrar"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-secondary w-full text-center"
                >
                  Entrar
                </Link>
                <Link
                  to="/registar"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary w-full text-center"
                >
                  Registar
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
