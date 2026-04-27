import { useState } from 'react'
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

interface BreedersPaginatedResponse {
  data: BreederResult[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

interface Props {
  searchParams: URLSearchParams
  setSearchParams: (params: URLSearchParams) => void
}

export function BreedersListView({ searchParams, setSearchParams }: Props) {
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
