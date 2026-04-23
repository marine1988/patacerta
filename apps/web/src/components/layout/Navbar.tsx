import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../ui/Avatar'
import { ThemeToggle } from '../ui/ThemeToggle'
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
      className={`inline-flex min-w-[1rem] items-center justify-center bg-caramel-500 px-1 text-[9px] font-semibold leading-none text-white ${className}`}
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
        pendingMessageReports: number
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
    ? `${data.pendingDocs} documento(s), ${data.pendingBreeders} criador(es), ${data.flaggedReviews} avaliação(ões) e ${data.pendingMessageReports} denúncia(s) a rever`
    : undefined
  return (
    <span
      className={`inline-flex min-w-[1rem] items-center justify-center bg-caramel-500 px-1 text-[9px] font-semibold leading-none text-white ${className}`}
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

  const isActive = (path: string) => location.pathname === path

  const navLinkClass = (path: string) =>
    `text-[11px] font-medium uppercase tracking-caps transition-colors ${
      isActive(path) ? 'text-caramel-500' : 'text-muted hover:text-ink'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[72rem] items-center justify-between px-6 py-5 lg:px-8">
        {/* Logo editorial — wordmark em Lora */}
        <Link
          to="/"
          className="font-serif text-xl tracking-tight text-ink transition-colors hover:text-caramel-700"
        >
          Pata<em className="italic text-caramel-500">Certa</em>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-10 md:flex">
          <Link to="/diretorio" className={navLinkClass('/diretorio')}>
            Diretório
          </Link>
          <Link to="/mapa" className={navLinkClass('/mapa')}>
            Mapa
          </Link>

          {isAuthenticated ? (
            <div className="flex items-center gap-6">
              <Link
                to="/painel"
                className={`${navLinkClass('/painel')} inline-flex items-center gap-2`}
              >
                Painel
                <UnreadBadge />
              </Link>
              {user?.role === 'ADMIN' && (
                <Link
                  to="/admin"
                  className={`${navLinkClass('/admin')} inline-flex items-center gap-2`}
                >
                  Admin
                  <AdminPendingBadge />
                </Link>
              )}
              <ThemeToggle />
              <div className="flex items-center gap-3 border-l border-line pl-4">
                <Avatar name={`${user?.firstName} ${user?.lastName}`} size="sm" />
                <span className="text-[11px] font-medium uppercase tracking-caps text-ink">
                  {user?.firstName}
                </span>
                <button
                  onClick={logout}
                  className="text-muted hover:text-caramel-500"
                  title="Sair"
                  aria-label="Sair"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
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
            <div className="flex items-center gap-5">
              <ThemeToggle />
              <Link
                to="/entrar"
                className="text-[11px] font-medium uppercase tracking-caps text-ink hover:text-caramel-500"
              >
                Entrar
              </Link>
              <Link to="/registar" className="btn-primary btn-sm">
                Juntar-me
              </Link>
            </div>
          )}
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="btn-icon"
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
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
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-line bg-bg px-6 pb-8 pt-4 md:hidden">
          <div className="flex flex-col gap-1">
            <Link
              to="/diretorio"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
            >
              Diretório
            </Link>
            <Link
              to="/mapa"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
            >
              Mapa
            </Link>

            {isAuthenticated ? (
              <>
                <Link
                  to="/painel"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex items-center gap-2 px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
                >
                  Painel
                  <UnreadBadge />
                </Link>
                {user?.role === 'ADMIN' && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center gap-2 px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
                  >
                    Admin
                    <AdminPendingBadge />
                  </Link>
                )}
                <div className="mt-4 border-t border-line pt-4">
                  <div className="flex items-center gap-3 px-2 py-2">
                    <Avatar name={`${user?.firstName} ${user?.lastName}`} size="sm" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs text-muted">{user?.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      logout()
                      setMobileMenuOpen(false)
                    }}
                    className="mt-2 w-full text-left px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-caramel-500"
                  >
                    Sair
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                <Link
                  to="/entrar"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-secondary w-full"
                >
                  Entrar
                </Link>
                <Link
                  to="/registar"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary w-full"
                >
                  Juntar-me
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
