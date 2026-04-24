import { useState, type FormEvent } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { SearchBar } from '../../components/shared/SearchBar'
import { BreederCard } from '../../components/shared/BreederCard'
import { ServiceCard, type ServiceCardData } from '../../components/shared/ServiceCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'

type ExplorarTipo = 'criadores' | 'servicos'

interface BreederResult {
  id: number
  businessName: string
  description: string | null
  status: string
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
  species: { speciesId: number; species: { id: number; namePt: string } }[]
  avgRating: number | null
  reviewCount: number
  createdAt: string
}

interface BreedersPaginatedResponse {
  data: BreederResult[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

interface ServicesPaginatedResponse {
  data: ServiceCardData[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

interface DistrictOption {
  id: number
  code: string
  namePt: string
}

interface MunicipalityOption {
  id: number
  namePt: string
}

interface ServiceCategoryOption {
  id: number
  nameSlug: string
  namePt: string
}

export function DirectoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const tipo: ExplorarTipo = searchParams.get('tipo') === 'servicos' ? 'servicos' : 'criadores'

  function setTipo(next: ExplorarTipo) {
    const params = new URLSearchParams(searchParams)
    if (next === 'criadores') params.delete('tipo')
    else params.set('tipo', next)
    // Reset filtros específicos quando troca de tipo
    params.delete('page')
    setSearchParams(params)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Explorar</h1>
        <p className="page-subtitle">
          Encontre criadores verificados e prestadores de serviços em Portugal.
        </p>
      </div>

      {/* Tabs tipo */}
      <div className="mt-4 border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Tipo">
          <button
            type="button"
            onClick={() => setTipo('criadores')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              tipo === 'criadores'
                ? 'border-caramel-600 text-caramel-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
            aria-current={tipo === 'criadores' ? 'page' : undefined}
          >
            Criadores
          </button>
          <button
            type="button"
            onClick={() => setTipo('servicos')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              tipo === 'servicos'
                ? 'border-caramel-600 text-caramel-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
            aria-current={tipo === 'servicos' ? 'page' : undefined}
          >
            Serviços
          </button>
        </nav>
      </div>

      {tipo === 'criadores' ? (
        <BreedersView
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          onGoToMap={() => {
            const qs = new URLSearchParams(searchParams)
            qs.delete('tipo')
            qs.delete('page')
            navigate(qs.toString() ? `/mapa?${qs.toString()}` : '/mapa')
          }}
        />
      ) : (
        <ServicesView
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          onGoToMap={() => {
            const qs = new URLSearchParams(searchParams)
            qs.set('tipo', 'servicos')
            qs.delete('page')
            navigate(`/mapa?${qs.toString()}`)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Breeders view (preserva o comportamento antigo do diretório)
// ─────────────────────────────────────────────────────────────────────

interface ViewProps {
  searchParams: URLSearchParams
  setSearchParams: (params: URLSearchParams) => void
  onGoToMap: () => void
}

function BreedersView({ searchParams, setSearchParams, onGoToMap }: ViewProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const speciesId = searchParams.get('speciesId') || undefined
  const districtId = searchParams.get('districtId') || undefined
  const query = searchParams.get('query') || undefined
  const page = parseInt(searchParams.get('page') || '1') || 1

  const { data, isLoading, isError } = useQuery<BreedersPaginatedResponse>({
    queryKey: ['breeders', { speciesId, districtId, query, page }],
    queryFn: () =>
      api
        .get('/search/breeders', {
          params: { speciesId, districtId, query, page, limit: 12 },
        })
        .then((r) => r.data),
  })

  const breeders = data?.data ?? []
  const meta = data?.meta

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(p))
    setSearchParams(params)
  }

  return (
    <>
      <div className="mt-6">
        <SearchBar />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {meta ? (
            <>
              <span className="font-semibold text-gray-900">{meta.total}</span> criadores
              encontrados
            </>
          ) : (
            'A carregar...'
          )}
        </p>

        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-caramel-100 text-caramel-600' : 'text-gray-400 hover:text-gray-600'}`}
            aria-label="Vista em grelha"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-caramel-100 text-caramel-600' : 'text-gray-400 hover:text-gray-600'}`}
            aria-label="Vista em lista"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={onGoToMap}
            className="rounded-md p-1.5 text-gray-400 hover:text-gray-600"
            aria-label="Ver no mapa"
            title="Ver no mapa"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Erro ao carregar criadores"
          description="Ocorreu um erro ao pesquisar. Tente novamente."
        />
      ) : breeders.length === 0 ? (
        <EmptyState
          title="Nenhum criador encontrado"
          description="Tente alterar os filtros de pesquisa ou explorar todos os criadores."
        />
      ) : (
        <>
          <div
            className={`mt-4 ${
              viewMode === 'grid'
                ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'flex flex-col gap-3'
            }`}
          >
            {breeders.map((breeder) => (
              <BreederCard key={breeder.id} {...breeder} />
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <Pagination page={page} totalPages={meta.totalPages} onGoToPage={goToPage} />
          )}
        </>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Services view
// ─────────────────────────────────────────────────────────────────────

function ServicesView({ searchParams, setSearchParams, onGoToMap }: ViewProps) {
  const categoryId = searchParams.get('categoryId') || ''
  const districtId = searchParams.get('districtId') || ''
  const municipalityId = searchParams.get('municipalityId') || ''
  const query = searchParams.get('query') || ''
  const priceMin = searchParams.get('priceMin') || ''
  const priceMax = searchParams.get('priceMax') || ''
  const sort = (searchParams.get('sort') as 'recent' | 'price_asc' | 'price_desc') || 'recent'
  const page = parseInt(searchParams.get('page') || '1') || 1

  const { data: categories = [] } = useQuery<ServiceCategoryOption[]>({
    queryKey: ['service-categories'],
    queryFn: () => api.get('/services/categories').then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  })

  const { data: districts = [] } = useQuery<DistrictOption[]>({
    queryKey: ['districts'],
    queryFn: () => api.get('/search/districts').then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  })

  const { data: municipalities = [] } = useQuery<MunicipalityOption[]>({
    queryKey: ['municipalities', districtId],
    queryFn: () =>
      api.get(`/search/districts/${districtId}/municipalities`).then((r) =>
        (r.data as Array<{ id: number; name?: string; namePt?: string }>).map((m) => ({
          id: m.id,
          namePt: m.namePt ?? m.name ?? '',
        })),
      ),
    enabled: !!districtId,
  })

  const { data, isLoading, isError } = useQuery<ServicesPaginatedResponse>({
    queryKey: [
      'services',
      { categoryId, districtId, municipalityId, query, priceMin, priceMax, sort, page },
    ],
    queryFn: () =>
      api
        .get('/services', {
          params: {
            categoryId: categoryId || undefined,
            districtId: districtId || undefined,
            municipalityId: municipalityId || undefined,
            q: query || undefined,
            priceMin: priceMin ? Math.round(Number(priceMin) * 100) : undefined,
            priceMax: priceMax ? Math.round(Number(priceMax) * 100) : undefined,
            sort,
            page,
            limit: 12,
          },
        })
        .then((r) => r.data),
  })

  const services = data?.data ?? []
  const meta = data?.meta

  function updateFilter(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    // Reset page quando filtros mudam
    next.delete('page')
    setSearchParams(next)
  }

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const q = String(form.get('query') || '').trim()
    const pMin = String(form.get('priceMin') || '').trim()
    const pMax = String(form.get('priceMax') || '').trim()
    updateFilter({ query: q, priceMin: pMin, priceMax: pMax })
  }

  function clearFilters() {
    const next = new URLSearchParams()
    next.set('tipo', 'servicos')
    setSearchParams(next)
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(p))
    setSearchParams(params)
  }

  const hasFilters = Boolean(
    categoryId || districtId || municipalityId || query || priceMin || priceMax,
  )

  return (
    <>
      {/* Filtros */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">Pesquisar</label>
              <Input name="query" defaultValue={query} placeholder="Título ou descrição..." />
            </div>
            <div className="md:w-56">
              <label className="mb-1 block text-xs font-medium text-gray-700">Categoria</label>
              <Select
                value={categoryId}
                onChange={(e) => updateFilter({ categoryId: e.target.value })}
                options={[
                  { value: '', label: 'Todas' },
                  ...categories.map((c) => ({ value: String(c.id), label: c.namePt })),
                ]}
              />
            </div>
            <div className="md:w-48">
              <label className="mb-1 block text-xs font-medium text-gray-700">Ordenar</label>
              <Select
                value={sort}
                onChange={(e) => updateFilter({ sort: e.target.value })}
                options={[
                  { value: 'recent', label: 'Mais recentes' },
                  { value: 'price_asc', label: 'Preço ↑' },
                  { value: 'price_desc', label: 'Preço ↓' },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="md:w-56">
              <label className="mb-1 block text-xs font-medium text-gray-700">Distrito</label>
              <Select
                value={districtId}
                onChange={(e) => updateFilter({ districtId: e.target.value, municipalityId: '' })}
                options={[
                  { value: '', label: 'Todos' },
                  ...districts.map((d) => ({ value: String(d.id), label: d.namePt })),
                ]}
              />
            </div>
            <div className="md:w-56">
              <label className="mb-1 block text-xs font-medium text-gray-700">Concelho</label>
              <Select
                value={municipalityId}
                onChange={(e) => updateFilter({ municipalityId: e.target.value })}
                disabled={!districtId}
                options={[
                  { value: '', label: 'Todos' },
                  ...municipalities.map((m) => ({ value: String(m.id), label: m.namePt })),
                ]}
              />
            </div>
            <div className="md:w-32">
              <label className="mb-1 block text-xs font-medium text-gray-700">Preço min (€)</label>
              <Input
                name="priceMin"
                defaultValue={priceMin}
                placeholder="0"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
              />
            </div>
            <div className="md:w-32">
              <label className="mb-1 block text-xs font-medium text-gray-700">Preço máx (€)</label>
              <Input
                name="priceMax"
                defaultValue={priceMax}
                placeholder="∞"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                Aplicar
              </Button>
              {hasFilters && (
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Bar */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {meta ? (
            <>
              <span className="font-semibold text-gray-900">{meta.total}</span> anúncios encontrados
            </>
          ) : (
            'A carregar...'
          )}
        </p>
        <button
          type="button"
          onClick={onGoToMap}
          className="flex items-center gap-1.5 text-sm font-medium text-caramel-600 hover:text-caramel-700"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          Ver no mapa
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Erro ao carregar anúncios"
          description="Ocorreu um erro ao pesquisar. Tente novamente."
        />
      ) : services.length === 0 ? (
        <EmptyState
          title="Nenhum anúncio encontrado"
          description="Tente alterar os filtros de pesquisa."
          action={
            <Link to="/painel?tab=servicos" className="btn-primary">
              Criar o meu anúncio
            </Link>
          }
        />
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <ServiceCard key={s.id} {...s} />
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <Pagination page={page} totalPages={meta.totalPages} onGoToPage={goToPage} />
          )}
        </>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Shared pagination
// ─────────────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number
  totalPages: number
  onGoToPage: (p: number) => void
}

function Pagination({ page, totalPages, onGoToPage }: PaginationProps) {
  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onGoToPage(page - 1)}
      >
        Anterior
      </Button>

      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let pageNum: number
          if (totalPages <= 7) {
            pageNum = i + 1
          } else if (page <= 4) {
            pageNum = i + 1
          } else if (page >= totalPages - 3) {
            pageNum = totalPages - 6 + i
          } else {
            pageNum = page - 3 + i
          }
          return (
            <button
              key={pageNum}
              onClick={() => onGoToPage(pageNum)}
              className={`h-8 w-8 rounded-md text-sm font-medium ${
                pageNum === page ? 'bg-caramel-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {pageNum}
            </button>
          )
        })}
      </div>

      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onGoToPage(page + 1)}
      >
        Seguinte
      </Button>
    </div>
  )
}
