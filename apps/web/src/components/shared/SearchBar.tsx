import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useBreeds, useDistricts } from '../../lib/useLookups'

interface SearchBarProps {
  compact?: boolean
}

export function SearchBar({ compact = false }: SearchBarProps) {
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
  const [breed, setBreed] = useState(() =>
    isOnSearch ? (searchParams.get('breedId') ?? '') : '',
  )
  const [query, setQuery] = useState(() => (isOnSearch ? (searchParams.get('query') ?? '') : ''))

  // Mantém o estado sincronizado quando o utilizador altera a URL por outro caminho
  // (ex: botão "Limpar" ou navegação back/forward) enquanto está em `/pesquisar`.
  useEffect(() => {
    if (!isOnSearch) return
    setDistrict(searchParams.get('districtId') ?? '')
    setBreed(searchParams.get('breedId') ?? '')
    setQuery(searchParams.get('query') ?? '')
  }, [isOnSearch, searchParams])

  const { data: districtList = [] } = useDistricts()
  const { data: breedList = [] } = useBreeds()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    // Preserva params alheios (ex: `tipo`, `vista`, `page`) que pertencem
    // a outros controlos da página `/pesquisar`.
    const params = isOnSearch ? new URLSearchParams(searchParams) : new URLSearchParams()
    if (district) params.set('districtId', district)
    else params.delete('districtId')
    if (breed) params.set('breedId', breed)
    else params.delete('breedId')
    const q = query.trim()
    if (q) params.set('query', q)
    else params.delete('query')
    // Ao mudar filtros, voltamos sempre à página 1.
    params.delete('page')
    navigate(`/pesquisar?${params.toString()}`)
  }

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
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-lg sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor="searchbar-district">
            Distrito
          </label>
          <select
            id="searchbar-district"
            className="select"
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

        <div>
          <label className="label" htmlFor="searchbar-breed">
            Raça
          </label>
          <select
            id="searchbar-breed"
            className="select"
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

        <div>
          <label className="label" htmlFor="searchbar-query">
            Pesquisa
          </label>
          <input
            id="searchbar-query"
            type="text"
            className="input"
            placeholder="Nome do criador..."
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
    </form>
  )
}
