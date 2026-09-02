import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useBreeds, useDistricts } from '../../lib/useLookups'

interface SearchBarProps {
  compact?: boolean
  showSearchType?: boolean
}

type SearchType = 'criadores' | 'servicos'

export function SearchBar({ compact = false, showSearchType = false }: SearchBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Quando renderizamos dentro de `/pesquisar`, queremos hidratar os campos
  // com os filtros activos. Em outras páginas (ex: home), os params estão
  // vazios e os campos começam vazios — o comportamento é o mesmo.
  const isOnSearch = location.pathname.startsWith('/pesquisar')
  const [district, setDistrict] = useState(() =>
    isOnSearch ? (searchParams.get('districtId') ?? '') : '',
  )
  const [breed, setBreed] = useState(() => (isOnSearch ? (searchParams.get('breedId') ?? '') : ''))
  const [query, setQuery] = useState(() => (isOnSearch ? (searchParams.get('query') ?? '') : ''))
  const [searchType, setSearchType] = useState<SearchType>(() =>
    isOnSearch && searchParams.get('tipo') === 'servicos' ? 'servicos' : 'criadores',
  )

  // Mantém o estado sincronizado quando o utilizador altera a URL por outro caminho
  // (ex: botão "Limpar" ou navegação back/forward) enquanto está em `/pesquisar`.
  useEffect(() => {
    if (!isOnSearch) return
    setDistrict(searchParams.get('districtId') ?? '')
    setBreed(searchParams.get('breedId') ?? '')
    setQuery(searchParams.get('query') ?? '')
    setSearchType(searchParams.get('tipo') === 'servicos' ? 'servicos' : 'criadores')
  }, [isOnSearch, searchParams])

  const { data: districtList = [] } = useDistricts()
  const { data: breedList = [] } = useBreeds()

  function getSearchParams() {
    // Preserva params alheios (ex: `tipo`, `vista`, `page`) que pertencem
    // a outros controlos da página `/pesquisar`.
    const params = isOnSearch ? new URLSearchParams(searchParams) : new URLSearchParams()
    if (showSearchType && searchType === 'servicos') params.set('tipo', 'servicos')
    else params.delete('tipo')
    if (district) params.set('districtId', district)
    else params.delete('districtId')
    if (breed && searchType === 'criadores') params.set('breedId', breed)
    else params.delete('breedId')
    const q = query.trim()
    if (q) params.set('query', q)
    else params.delete('query')
    // Ao mudar filtros, voltamos sempre à página 1.
    params.delete('page')
    return params
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = getSearchParams()
    navigate(`/pesquisar?${params.toString()}`)
  }

  const advancedSearchPath = `/pesquisar?${getSearchParams().toString()}`

  if (compact) {
    return (
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="Pesquisar criadores..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" variant="primary" size="sm">
          Pesquisar
        </Button>
      </form>
    )
  }

  return (
    <form
      onSubmit={handleSearch}
      className="rounded-md border border-line bg-surface p-5 shadow-soft sm:p-6"
    >
      {showSearchType && (
        <div className="mb-5 border-b border-line">
          <div className="-mb-px flex gap-6" aria-label="Tipo de pesquisa">
            <button
              type="button"
              onClick={() => setSearchType('criadores')}
              className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
                searchType === 'criadores'
                  ? 'border-caramel-600 text-caramel-700'
                  : 'border-transparent text-muted hover:border-line hover:text-ink'
              }`}
              aria-pressed={searchType === 'criadores'}
            >
              Criadores
            </button>
            <button
              type="button"
              onClick={() => setSearchType('servicos')}
              className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
                searchType === 'servicos'
                  ? 'border-caramel-600 text-caramel-700'
                  : 'border-transparent text-muted hover:border-line hover:text-ink'
              }`}
              aria-pressed={searchType === 'servicos'}
            >
              Serviços
            </button>
          </div>
        </div>
      )}

      <div
        className={`grid gap-4 sm:grid-cols-2 ${searchType === 'criadores' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
      >
        <div>
          <label className="label" htmlFor="searchbar-district">
            Distrito
          </label>
          <select
            id="searchbar-district"
            className="select searchbar-control"
            aria-label="Distrito"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">Todos os distritos</option>
            {districtList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.namePt}
              </option>
            ))}
          </select>
        </div>

        {searchType === 'criadores' && (
          <div>
            <label className="label" htmlFor="searchbar-breed">
              Raça
            </label>
            <select
              id="searchbar-breed"
              className="select searchbar-control"
              aria-label="Raça"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
            >
              <option value="">Todas as raças</option>
              {breedList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.namePt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="searchbar-query">
            Pesquisa
          </label>
          <input
            id="searchbar-query"
            type="text"
            className="input searchbar-control"
            placeholder={
              searchType === 'servicos' ? 'Serviço ou profissional...' : 'Nome do criador...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <Button type="submit" variant="primary" className="w-full" size="lg">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            Pesquisar
          </Button>
        </div>
      </div>
      {showSearchType && (
        <div className="mt-5 flex justify-center border-t border-line pt-4">
          <Link to={advancedSearchPath} className="btn-secondary btn-sm">
            Pesquisa avançada
          </Link>
        </div>
      )}
    </form>
  )
}
