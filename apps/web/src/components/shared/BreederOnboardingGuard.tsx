import { Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { Spinner } from '../ui/Spinner'

/**
 * Hard guard that runs after auth: if the user is a BREEDER but has no
 * Breeder profile yet, force them to /onboarding/criador. Skipped for
 * the onboarding page itself and for /sair-style flows.
 *
 * Wrapped around any authenticated layout/page so users can't navigate
 * around until their breeder profile exists.
 */
export function BreederOnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  const isBreeder = user?.role === 'BREEDER'

  const { data, isLoading } = useQuery<{ id: number } | null>({
    queryKey: ['breeder-profile-guard', user?.id],
    queryFn: () =>
      api
        .get('/breeders/me/profile')
        .then((r) => r.data)
        .catch(() => null),
    enabled: isBreeder,
    staleTime: 60_000,
    retry: false,
  })

  // Not a breeder → no-op.
  if (!isBreeder) return <>{children}</>

  // Already on the onboarding page → render it.
  if (location.pathname === '/onboarding/criador') return <>{children}</>

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  const hasProfile = !!(data && (data as { id?: number }).id)
  if (!hasProfile) {
    return <Navigate to="/onboarding/criador" replace />
  }

  return <>{children}</>
}
