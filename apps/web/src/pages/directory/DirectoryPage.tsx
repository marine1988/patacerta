import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { SearchBar } from '../../components/shared/SearchBar'
import { BreederCard } from '../../components/shared/BreederCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'

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

interface PaginatedResponse {
  data: BreederResult[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export function DirectoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const speciesId = searchParams.get('speciesId') || undefined
  const districtId = searchParams.get('districtId') || undefined
  const query = searchParams.get('query') || undefined
  const page = parseInt(searchParams.get('page') || '1') || 1

  function goToMap() {
    const params = new URLSearchParams()
    if (speciesId) params.set('speciesId', speciesId)
    if (districtId) params.set('districtId', districtId)
    if (query) params.set('query', query)
    const qs = params.toString()
    navigate(qs ? `/mapa?${qs}` : '/mapa')
  }

  const { data, isLoading, isError } = useQuery<PaginatedResponse>({
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
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Diretório de Criadores</h1>
        <p className="page-subtitle">
          Encontre criadores verificados pela DGAV em todo o Portugal.
        </p>
      </div>

      {/* Search */}
      <SearchBar />

      {/* Results bar */}
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

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
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
            className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
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
            onClick={goToMap}
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

      {/* Results */}
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

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                Anterior
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(meta.totalPages, 7) }, (_, i) => {
                  let pageNum: number
                  if (meta.totalPages <= 7) {
                    pageNum = i + 1
                  } else if (page <= 4) {
                    pageNum = i + 1
                  } else if (page >= meta.totalPages - 3) {
                    pageNum = meta.totalPages - 6 + i
                  } else {
                    pageNum = page - 3 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`h-8 w-8 rounded-md text-sm font-medium ${
                        pageNum === page
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
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
                disabled={page >= (meta?.totalPages ?? 1)}
                onClick={() => goToPage(page + 1)}
              >
                Seguinte
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
