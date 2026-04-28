import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { MainLayout } from './components/layout/MainLayout'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import { Spinner } from './components/ui/Spinner'

// Lazy-loaded pages — code-split at route level
const HomePage = lazy(() => import('./pages/home/HomePage').then((m) => ({ default: m.HomePage })))
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const RegisterPage = lazy(() =>
  import('./pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
)
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  })),
)
const VerifyEmailPage = lazy(() =>
  import('./pages/auth/VerifyEmailPage').then((m) => ({
    default: m.VerifyEmailPage,
  })),
)
const PesquisarPage = lazy(() =>
  import('./pages/pesquisar/PesquisarPage').then((m) => ({
    default: m.PesquisarPage,
  })),
)
const BreederProfilePage = lazy(() =>
  import('./pages/breeder/BreederProfilePage').then((m) => ({
    default: m.BreederProfilePage,
  })),
)
const ServiceDetailPage = lazy(() =>
  import('./pages/service/ServiceDetailPage').then((m) => ({
    default: m.ServiceDetailPage,
  })),
)
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const BreederOnboardingPage = lazy(() =>
  import('./pages/onboarding/BreederOnboardingPage').then((m) => ({
    default: m.BreederOnboardingPage,
  })),
)
const PublicarPage = lazy(() =>
  import('./pages/publicar/PublicarPage').then((m) => ({ default: m.PublicarPage })),
)
const AdminPage = lazy(() =>
  import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const PrivacyPolicyPage = lazy(() =>
  import('./pages/legal/PrivacyPolicyPage').then((m) => ({
    default: m.PrivacyPolicyPage,
  })),
)
const TermsPage = lazy(() =>
  import('./pages/legal/TermsPage').then((m) => ({ default: m.TermsPage })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)
const SimuladorRacaPage = lazy(() =>
  import('./pages/simulador/SimuladorRacaPage').then((m) => ({
    default: m.SimuladorRacaPage,
  })),
)
function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}

/**
 * Redirige rotas legadas (/diretorio, /servicos, /mapa, /explorar) para /pesquisar
 * preservando a query string e injectando tipo/vista quando aplicavel.
 */
function RedirectToPesquisar({
  tipo,
  vista,
}: {
  tipo?: 'criadores' | 'servicos'
  vista?: 'lista' | 'mapa'
}) {
  const [searchParams] = useSearchParams()
  const next = new URLSearchParams(searchParams)
  if (tipo === 'servicos' && !next.get('tipo')) next.set('tipo', 'servicos')
  if (vista === 'mapa' && !next.get('vista')) next.set('vista', 'mapa')
  const qs = next.toString()
  return <Navigate to={qs ? `/pesquisar?${qs}` : '/pesquisar'} replace />
}

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown
  resetErrorBoundary: () => void
}) {
  const message =
    error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-semibold text-red-700">Algo correu mal</h2>
      <p className="max-w-md text-muted">{message}</p>
      <button onClick={resetErrorBoundary} className="btn-primary btn-sm">
        Tentar novamente
      </button>
    </div>
  )
}

export function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<MainLayout />}>
            {/* Public */}
            <Route path="/" element={<HomePage />} />
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/registar" element={<RegisterPage />} />
            <Route path="/recuperar-palavra-passe" element={<ResetPasswordPage />} />
            <Route path="/verificar-email" element={<VerifyEmailPage />} />
            <Route path="/diretorio" element={<RedirectToPesquisar />} />
            <Route path="/servicos" element={<RedirectToPesquisar tipo="servicos" />} />
            <Route path="/mapa" element={<RedirectToPesquisar vista="mapa" />} />
            <Route path="/explorar" element={<RedirectToPesquisar />} />
            <Route path="/pesquisar" element={<PesquisarPage />} />
            <Route path="/simulador-raca" element={<SimuladorRacaPage />} />
            <Route path="/criador/:id" element={<BreederProfilePage />} />
            <Route path="/servicos/:id" element={<ServiceDetailPage />} />
            <Route path="/politica-privacidade" element={<PrivacyPolicyPage />} />
            <Route path="/termos" element={<TermsPage />} />

            {/* Protected — any authenticated user */}
            <Route
              path="/painel"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Protected — publish flow (any authenticated user) */}
            <Route
              path="/publicar"
              element={
                <ProtectedRoute>
                  <PublicarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/publicar/criador"
              element={
                <ProtectedRoute>
                  <BreederOnboardingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/publicar/servico"
              element={<Navigate to="/painel?tab=servicos&new=1" replace />}
            />

            {/* Legacy: /onboarding/criador → /publicar/criador */}
            <Route
              path="/onboarding/criador"
              element={<Navigate to="/publicar/criador" replace />}
            />

            {/* Protected — admin only */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
