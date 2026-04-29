import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Select, Spinner } from '../../components/ui'
import { PatrocinadosTab } from './PatrocinadosTab'

/* ============================================================
 * AdminPage — shell com lazy loading dos tabs
 *
 * Cada tab é code-split via React.lazy, reduzindo o bundle
 * inicial do painel de admin. PatrocinadosTab fica eager por
 * já estar num ficheiro próprio com bundle leve.
 * ============================================================ */

const ResumoTab = lazy(() => import('./tabs/ResumoTab').then((m) => ({ default: m.ResumoTab })))
const VerificacoesTab = lazy(() =>
  import('./tabs/VerificacoesTab').then((m) => ({ default: m.VerificacoesTab })),
)
const UtilizadoresTab = lazy(() =>
  import('./tabs/UtilizadoresTab').then((m) => ({ default: m.UtilizadoresTab })),
)
const CriadoresTab = lazy(() =>
  import('./tabs/CriadoresTab').then((m) => ({ default: m.CriadoresTab })),
)
const ServicosTab = lazy(() =>
  import('./tabs/ServicosTab').then((m) => ({ default: m.ServicosTab })),
)
const AvaliacoesTab = lazy(() =>
  import('./tabs/AvaliacoesTab').then((m) => ({ default: m.AvaliacoesTab })),
)
const DenunciasTab = lazy(() =>
  import('./tabs/DenunciasTab').then((m) => ({ default: m.DenunciasTab })),
)
const AuditoriaTab = lazy(() =>
  import('./tabs/AuditoriaTab').then((m) => ({ default: m.AuditoriaTab })),
)

interface TabDef {
  id: string
  label: string
  icon: ReactNode
  content: ReactNode
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<string>('resumo')

  const tabs: TabDef[] = [
    {
      id: 'resumo',
      label: 'Resumo',
      icon: (
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
            d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
          />
        </svg>
      ),
      content: <ResumoTab />,
    },
    {
      id: 'verificacoes',
      label: 'Verificações',
      icon: (
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
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      ),
      content: <VerificacoesTab />,
    },
    {
      id: 'utilizadores',
      label: 'Utilizadores',
      icon: (
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
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
      ),
      content: <UtilizadoresTab />,
    },
    {
      id: 'criadores',
      label: 'Criadores',
      icon: (
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
            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
          />
        </svg>
      ),
      content: <CriadoresTab />,
    },
    {
      id: 'servicos',
      label: 'Serviços',
      icon: (
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
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      ),
      content: <ServicosTab />,
    },
    {
      id: 'avaliacoes',
      label: 'Avaliações',
      icon: (
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
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
      ),
      content: <AvaliacoesTab />,
    },
    {
      id: 'denuncias',
      label: 'Denúncias',
      icon: (
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
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      ),
      content: <DenunciasTab />,
    },
    {
      id: 'patrocinados',
      label: 'Patrocinados',
      icon: (
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
            d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
          />
        </svg>
      ),
      content: <PatrocinadosTab />,
    },
    {
      id: 'auditoria',
      label: 'Auditoria',
      icon: (
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
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      ),
      content: <AuditoriaTab />,
    },
  ]

  const activeContent = tabs.find((t) => t.id === activeTab)?.content ?? tabs[0].content

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Painel de administração</h1>
        <p className="page-subtitle">
          Gerir utilizadores, criadores, verificações e conteúdo da plataforma.
        </p>
      </div>

      {/* Mobile / tablet: select dropdown */}
      <div className="mb-6 lg:hidden">
        <Select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          aria-label="Secção do painel"
          options={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
        />
      </div>

      {/* Desktop: vertical sidebar + content */}
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <nav
          className="hidden lg:block"
          aria-label="Secções do painel de administração"
          role="tablist"
          aria-orientation="vertical"
        >
          <ul className="flex flex-col gap-1 border-l border-gray-200">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`-ml-px flex w-full items-center gap-3 border-l-2 px-4 py-2 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-caramel-600 bg-caramel-50/40 text-caramel-700'
                        : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                    }`}
                  >
                    <span className="shrink-0">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div role="tabpanel" className="min-w-0">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Spinner />
              </div>
            }
          >
            {activeContent}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
