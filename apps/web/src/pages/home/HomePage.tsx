import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { SearchBar } from '../../components/shared/SearchBar'
import { StatsBar } from '../../components/shared/StatsBar'

interface PublicStats {
  breederCount: number
  speciesCount: number
  districtCount: number
  reviewCount: number
}

const FALLBACK_STATS = [
  { label: 'Criadores verificados', value: '...' },
  { label: 'Espécies disponíveis', value: '...' },
  { label: 'Distritos cobertos', value: '...' },
  { label: 'Avaliações publicadas', value: '...' },
]

export function HomePage() {
  const { data: stats } = useQuery<PublicStats>({
    queryKey: ['public-stats'],
    queryFn: () => api.get('/search/stats').then((r) => r.data),
    staleTime: 3600_000,
  })

  const statsDisplay = stats
    ? [
        { label: 'Criadores verificados', value: String(stats.breederCount) },
        { label: 'Espécies disponíveis', value: String(stats.speciesCount) },
        { label: 'Distritos cobertos', value: String(stats.districtCount) },
        { label: 'Avaliações publicadas', value: String(stats.reviewCount) },
      ]
    : FALLBACK_STATS

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 py-20 sm:py-28">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -left-4 -top-4 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-8 right-10 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Criadores <span className="text-primary-200">verificados</span>
            <br />
            em Portugal
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-primary-100 sm:text-xl">
            A PataCerta conecta donos de animais com criadores certificados pela DGAV.
            Transparência, segurança e confiança.
          </p>

          {/* Search bar */}
          <div className="mx-auto mt-10 max-w-4xl">
            <SearchBar />
          </div>

          {/* Stats */}
          <div className="mx-auto mt-12 max-w-3xl">
            <StatsBar stats={statsDisplay} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="page-container py-16 sm:py-24">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Porque escolher a PataCerta?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            Somos a primeira plataforma portuguesa dedicada à verificação de criadores.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="section text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Criadores Verificados</h3>
            <p className="mt-2 text-sm text-gray-600">
              Verificamos o registo DGAV, NIF e documentação de cada criador antes de aprovar o perfil.
            </p>
          </div>

          <div className="section text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
              <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Pesquisa Inteligente</h3>
            <p className="mt-2 text-sm text-gray-600">
              Encontre criadores por espécie, distrito ou nome. Filtros avançados para encontrar exatamente o que procura.
            </p>
          </div>

          <div className="section text-center sm:col-span-2 lg:col-span-1">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100">
              <svg className="h-7 w-7 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Contacto Direto</h3>
            <p className="mt-2 text-sm text-gray-600">
              Comunique diretamente com criadores verificados através do nosso sistema de mensagens seguro.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            É criador certificado?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-400">
            Registe-se na PataCerta e ganhe visibilidade junto de milhares de potenciais donos.
            A verificação é gratuita.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/registar" className="btn-primary btn-lg">
              Registar como Criador
            </Link>
            <Link to="/diretorio" className="btn-ghost text-gray-300 hover:text-white">
              Explorar diretório
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
