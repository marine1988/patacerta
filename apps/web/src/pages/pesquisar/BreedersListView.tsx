import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { SearchBar } from '../../components/shared/SearchBar'
import { BreederCard, BreederCardSkeleton } from '../../components/shared/BreederCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { useItemListJsonLd } from '../../hooks/useItemListJsonLd'

interface BreederResult {
  id: number
  slug?: string | null
  businessName: string
  description: string | null
  status: string
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
  photos: Array<{ id: number; url: string; sortOrder: number }>
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
  const breedId = searchParams.get('breedId') || undefined
  const query = searchParams.get('query') || undefined
  // Clamp inferior a 1: `parseInt('abc')` -> NaN -> `|| 1`, mas
  // `parseInt('-5')` -> -5 (truthy negativo passa o `||`). Tambem aceita
  // page=0 que devolveria pagina vazia. Math.max(1, ...) cobre ambos.
  // O clamp superior (page > totalPages) e' feito apos data carregar,
  // via useEffect mais abaixo.
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const { data, isLoading, isError, refetch } = useQuery<BreedersPaginatedResponse>({
    queryKey: ['breeders', { speciesId, districtId, breedId, query, page }],
    queryFn: () =>
      api
        .get('/search/breeders', {
          params: { speciesId, districtId, breedId, query, page, limit: 12 },
        })
        .then((r) => r.data),
  })

  const breeders = data?.data ?? []
  const meta = data?.meta
  const hasFilters = Boolean(districtId || breedId || query)

  // Se o utilizador entrar com ?page=99999 a API devolve uma pagina vazia
  // sem indicacao visivel — o componente renderizaria EmptyState mesmo
  // existindo resultados nas primeiras paginas. Apos saber `totalPages`,
  // se a page actual for superior, redirige para a ultima pagina valida.
  useEffect(() => {
    if (!meta) return
    if (meta.totalPages === 0) return // sem resultados, EmptyState dedicado
    if (page > meta.totalPages) {
      const params = new URLSearchParams(searchParams)
      params.set('page', String(meta.totalPages))
      setSearchParams(params)
    }
  }, [meta, page, searchParams, setSearchParams])

  // ItemList JSON-LD ajuda Google e LLMs a compreender a estrutura da
  // listagem. Só emitimos na primeira página (paginas seguintes não trazem
  // benefício SEO acrescido e duplicariam URLs nos crawlers).
  useItemListJsonLd(
    page === 1
      ? breeders.map((b) => ({
          path: `/criador/${b.slug ?? b.id}`,
          name: b.businessName,
        }))
      : [],
    'Criadores Verificados em Portugal',
  )

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
            aria-pressed={viewMode === 'grid'}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
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
            aria-pressed={viewMode === 'list'}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
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
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <BreederCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Erro ao carregar criadores"
          description="Ocorreu um erro ao pesquisar. Verifique a sua ligação e tente novamente."
          action={
            <Button variant="primary" onClick={() => refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : breeders.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="Nenhum criador encontrado"
            description="Tente alterar os filtros de pesquisa ou explorar todos os criadores."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  const next = new URLSearchParams()
                  setSearchParams(next)
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Ainda não há criadores verificados"
            description="Por agora não há criadores listados. Se é criador, registe-se e candidate-se a verificação."
            action={
              <Link to="/registar" className="btn-primary">
                Sou criador
              </Link>
            }
          />
        )
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
    <nav
      className="mt-8 flex items-center justify-center gap-2"
      role="navigation"
      aria-label="Paginação dos resultados"
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onGoToPage(page - 1)}
        aria-label="Página anterior"
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
          const isCurrent = pageNum === page
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onGoToPage(pageNum)}
              aria-label={`Página ${pageNum}`}
              aria-current={isCurrent ? 'page' : undefined}
              className={`h-8 w-8 rounded-md text-sm font-medium ${
                isCurrent ? 'bg-caramel-600 text-white' : 'text-gray-600 hover:bg-gray-100'
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
        aria-label="Página seguinte"
      >
        Seguinte
      </Button>
    </nav>
  )
}
