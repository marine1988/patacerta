import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { Tabs, Spinner } from '../../components/ui'

// Tabs pesados — lazy-loaded para reduzir o bundle inicial do Dashboard.
// Cada um vai para o seu chunk e só é descarregado quando o utilizador
// clica no respectivo separador.
const ProfileTabLazy = lazy(() => import('./ProfileTab').then((m) => ({ default: m.ProfileTab })))
const BreederTabLazy = lazy(() => import('./BreederTab').then((m) => ({ default: m.BreederTab })))
const ServicesTabLazy = lazy(() =>
  import('./ServicesTab').then((m) => ({ default: m.ServicesTab })),
)
const MessagesTabLazy = lazy(() =>
  import('./MessagesTab').then((m) => ({ default: m.MessagesTab })),
)
const MyReviewsTabLazy = lazy(() =>
  import('./MyReviewsTab').then((m) => ({ default: m.MyReviewsTab })),
)
const ReceivedReviewsTabLazy = lazy(() =>
  import('./ReceivedReviewsTab').then((m) => ({ default: m.ReceivedReviewsTab })),
)
const SettingsTabLazy = lazy(() =>
  import('./SettingsTab').then((m) => ({ default: m.SettingsTab })),
)

function LazyTabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner />
    </div>
  )
}

function withFallback(node: React.ReactNode) {
  return <Suspense fallback={<LazyTabFallback />}>{node}</Suspense>
}

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  // Tabs derivam de "tem perfil/servicos?", nao do role. Permite ter
  // simultaneamente perfil de criador e servicos no mesmo painel.
  const { data: breederProbe } = useQuery<{ id: number } | null>({
    queryKey: ['breeder-profile-probe', user?.id],
    queryFn: () =>
      api
        .get('/breeders/me/profile')
        .then((r) => r.data)
        .catch(() => null),
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  })
  const { data: servicesProbe } = useQuery<{ data: Array<{ id: number }> } | null>({
    queryKey: ['my-services-probe', user?.id],
    queryFn: () =>
      api
        .get('/services/mine')
        .then((r) => r.data)
        .catch(() => null),
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  })

  const tabParam = searchParams.get('tab') ?? 'profile'
  const hasBreederProfile = !!breederProbe?.id
  const hasServices = !!servicesProbe?.data && servicesProbe.data.length > 0
  const isBreeder = hasBreederProfile
  // Tab "Criador" aparece para qualquer non-admin: serve tanto para gerir
  // o perfil existente como para o criar (entra direto em modo formulario).
  const showBreederTab = !!user && user.role !== 'ADMIN'
  // Tab de servicos aparece se ja presta servicos OU se e OWNER autenticado
  // (para poder criar o primeiro). Admin nao tem painel de servicos.
  const showServicesTab =
    !!user &&
    user.role !== 'ADMIN' &&
    (hasServices || user.role === 'OWNER' || user.role === 'SERVICE_PROVIDER')

  const tabs = [
    {
      id: 'profile',
      label: 'Perfil',
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
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      ),
      content: withFallback(<ProfileTabLazy />),
    },
    ...(showBreederTab
      ? [
          {
            id: 'criador',
            label: hasBreederProfile ? 'Criador' : 'Tornar-me criador',
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
            content: withFallback(<BreederTabLazy />),
          },
        ]
      : []),
    ...(showServicesTab
      ? [
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
                  d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
            ),
            content: withFallback(<ServicesTabLazy />),
          },
        ]
      : []),
    {
      id: 'mensagens',
      label: 'Mensagens',
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
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
        </svg>
      ),
      content: withFallback(<MessagesTabLazy />),
    },
    {
      id: 'avaliacoes',
      label: 'Minhas avaliações',
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
      content: withFallback(<MyReviewsTabLazy />),
    },
    ...(isBreeder || hasServices
      ? [
          {
            id: 'avaliacoes-recebidas',
            label: 'Avaliações sobre mim',
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
            content: withFallback(
              <ReceivedReviewsTabLazy includeBreeder={isBreeder} includeServices={hasServices} />,
            ),
          },
        ]
      : []),
    {
      id: 'definicoes',
      label: 'Definições',
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
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      content: withFallback(<SettingsTabLazy />),
    },
  ]

  const defaultTab = tabs.some((t) => t.id === tabParam) ? tabParam : 'profile'

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Área pessoal</h1>
        <p className="page-subtitle">Gerir o seu perfil, mensagens e definições.</p>
      </div>

      <Tabs tabs={tabs} defaultTab={defaultTab} />
    </div>
  )
}
