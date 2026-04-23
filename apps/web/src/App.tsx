import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
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
const DirectoryPage = lazy(() =>
  import('./pages/directory/DirectoryPage').then((m) => ({
    default: m.DirectoryPage,
  })),
)
const MapPage = lazy(() => import('./pages/map/MapPage').then((m) => ({ default: m.MapPage })))
const BreederProfilePage = lazy(() =>
  import('./pages/breeder/BreederProfilePage').then((m) => ({
    default: m.BreederProfilePage,
  })),
)
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
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
            <Route path="/diretorio" element={<DirectoryPage />} />
            <Route path="/mapa" element={<MapPage />} />
            <Route path="/criador/:id" element={<BreederProfilePage />} />
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
