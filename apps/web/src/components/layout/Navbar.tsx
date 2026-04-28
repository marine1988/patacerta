import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'
import { ThemeToggle } from '../ui/ThemeToggle'
import { LogoMark } from '../shared/LogoMark'
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
        pendingServiceReports: number
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
    ? `${data.pendingDocs} documento(s), ${data.pendingBreeders} criador(es), ${data.flaggedReviews} avaliação(ões), ${data.pendingMessageReports} denúncia(s) de mensagem e ${data.pendingServiceReports} denúncia(s) de serviço a rever`
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

/**
 * Badge agregado mostrado junto ao avatar/nome no topo: soma mensagens
 * nao-lidas com items pendentes do admin (quando aplicavel). Sinaliza
 * que existe algo a tratar dentro do dropdown sem o utilizador ter de
 * o abrir.
 */
function UserMenuAggregateBadge({
  isAdmin,
  className = '',
}: {
  isAdmin: boolean
  className?: string
}) {
  const { data: unread } = useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: async () => {
      const res = await api.get<{ unreadCount: number }>('/messages/unread-count')
      return res.data
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const { data: pending } = useQuery({
    queryKey: ['admin', 'pending-counts'],
    queryFn: async () => {
      const res = await api.get<{ total: number }>('/admin/pending-counts')
      return res.data
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: isAdmin,
  })
  const total = (unread?.unreadCount ?? 0) + (isAdmin ? (pending?.total ?? 0) : 0)
  if (total <= 0) return null
  return (
    <span
      className={`inline-flex min-w-[1rem] items-center justify-center bg-caramel-500 px-1 text-[9px] font-semibold leading-none text-white ${className}`}
      aria-label={`${total} item(s) por tratar`}
    >
      {total > 99 ? '99+' : total}
    </span>
  )
}

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const currentTab = new URLSearchParams(location.search).get('tab')
  const isMessagesActive = location.pathname === '/area-pessoal' && currentTab === 'mensagens'
  const isDashboardActive = location.pathname === '/area-pessoal' && currentTab !== 'mensagens'

  const isActive = (path: string) => location.pathname === path

  const isPesquisar = location.pathname === '/pesquisar'

  // Fecha o dropdown do utilizador ao clicar fora ou navegar para outra rota.
  useEffect(() => {
    if (!userMenuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [userMenuOpen])
  useEffect(() => {
    setUserMenuOpen(false)
  }, [location.pathname, location.search])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[72rem] items-center justify-between px-6 py-5 lg:px-8">
        {/* Logo editorial — icone + wordmark em Lora */}
        <Link
          to="/"
          className="group flex items-center gap-2.5 font-serif text-xl tracking-tight text-ink transition-colors hover:text-caramel-700"
        >
          <LogoMark size={26} className="shrink-0 transition-transform group-hover:scale-105" />
          <span>
            Pata<em className="italic text-caramel-500">Certa</em>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-10 md:flex">
          <Link
            to="/pesquisar"
            className={`text-[11px] font-medium uppercase tracking-caps transition-colors ${
              isPesquisar ? 'text-caramel-500' : 'text-muted hover:text-ink'
            }`}
          >
            Pesquisar
          </Link>
          <Link
            to="/simulador-raca"
            className={`text-[11px] font-medium uppercase tracking-caps transition-colors ${
              isActive('/simulador-raca') ? 'text-caramel-500' : 'text-muted hover:text-ink'
            }`}
          >
            Simulador
          </Link>

          {isAuthenticated ? (
            <div className="flex items-center gap-6">
              {user?.role !== 'ADMIN' && (
                <Link to="/publicar" className="btn-primary btn-sm">
                  Publicar
                </Link>
              )}
              <ThemeToggle />
              {/* Dropdown do utilizador — Mensagens, Area pessoal, Admin
                  e Sair vivem aqui dentro para libertar espaco no topo
                  em ecras tablet (entre 768px e ~1100px). */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-3 border-l border-line pl-4 text-left hover:text-caramel-500"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <Avatar name={`${user?.firstName} ${user?.lastName}`} size="sm" />
                  <span className="text-[11px] font-medium uppercase tracking-caps text-ink">
                    {user?.firstName}
                  </span>
                  {/* Badge agregado: soma mensagens nao-lidas + admin pendentes
                      para sinalizar que ha algo a tratar dentro do dropdown. */}
                  <UserMenuAggregateBadge isAdmin={user?.role === 'ADMIN'} />
                  <svg
                    className={`h-3.5 w-3.5 text-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-2 min-w-[220px] border border-line bg-bg shadow-lg"
                    style={{ borderRadius: 2 }}
                    role="menu"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="text-sm font-medium text-ink">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="truncate text-xs text-muted">{user?.email}</p>
                    </div>
                    <Link
                      to="/area-pessoal?tab=mensagens"
                      className={`flex items-center justify-between gap-3 px-4 py-3 text-[11px] font-medium uppercase tracking-caps transition-colors hover:bg-cream-50 ${
                        isMessagesActive ? 'text-caramel-500' : 'text-ink'
                      }`}
                      role="menuitem"
                    >
                      <span className="inline-flex items-center gap-2">
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
                            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                          />
                        </svg>
                        Mensagens
                      </span>
                      <UnreadBadge />
                    </Link>
                    <Link
                      to="/area-pessoal"
                      className={`flex items-center px-4 py-3 text-[11px] font-medium uppercase tracking-caps transition-colors hover:bg-cream-50 ${
                        isDashboardActive ? 'text-caramel-500' : 'text-ink'
                      }`}
                      role="menuitem"
                    >
                      Área pessoal
                    </Link>
                    {user?.role === 'ADMIN' && (
                      <Link
                        to="/admin"
                        className={`flex items-center justify-between gap-3 px-4 py-3 text-[11px] font-medium uppercase tracking-caps transition-colors hover:bg-cream-50 ${
                          isActive('/admin') ? 'text-caramel-500' : 'text-ink'
                        }`}
                        role="menuitem"
                      >
                        Admin
                        <AdminPendingBadge />
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false)
                        logout()
                      }}
                      className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-[11px] font-medium uppercase tracking-caps text-caramel-500 transition-colors hover:bg-cream-50"
                      role="menuitem"
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
                      Sair
                    </button>
                  </div>
                )}
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
              to="/pesquisar"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
            >
              Pesquisar
            </Link>
            <Link
              to="/simulador-raca"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
            >
              Simulador
            </Link>

            {isAuthenticated ? (
              <>
                <Link
                  to="/area-pessoal?tab=mensagens"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex items-center gap-2 px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
                  aria-label="Mensagens"
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
                      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                    />
                  </svg>
                  Mensagens
                  <UnreadBadge />
                </Link>
                <Link
                  to="/area-pessoal"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex items-center gap-2 px-2 py-3 text-[11px] font-medium uppercase tracking-caps text-ink"
                >
                  Área pessoal
                </Link>
                {user?.role !== 'ADMIN' && (
                  <Link
                    to="/publicar"
                    onClick={() => setMobileMenuOpen(false)}
                    className="btn-primary mt-2 w-full"
                  >
                    Publicar
                  </Link>
                )}
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
