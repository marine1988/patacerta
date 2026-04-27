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
const ExplorarPage = lazy(() =>
  import('./pages/explorar/ExplorarPage').then((m) => ({
    default: m.ExplorarPage,
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
function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}

/**
 * Redirige rotas legadas (/diretorio, /servicos, /mapa) para /explorar
 * preservando a query string e injectando tipo/vista quando aplicavel.
 */
function RedirectToExplorar({
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
  return <Navigate to={qs ? `/explorar?${qs}` : '/explorar'} replace />
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
            <Route path="/diretorio" element={<RedirectToExplorar />} />
            <Route path="/servicos" element={<RedirectToExplorar tipo="servicos" />} />
            <Route path="/mapa" element={<RedirectToExplorar vista="mapa" />} />
            <Route path="/explorar" element={<ExplorarPage />} />
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

            {/* Protected — breeder onboarding */}
            <Route
              path="/onboarding/criador"
              element={
                <ProtectedRoute roles={['BREEDER']}>
                  <BreederOnboardingPage />
                </ProtectedRoute>
              }
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
