import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button } from '../ui/Button'

interface SearchBarProps {
  compact?: boolean
}

interface SpeciesOption {
  id: number
  nameSlug: string
  namePt: string
}

interface DistrictOption {
  id: number
  code: string
  namePt: string
}

export function SearchBar({ compact = false }: SearchBarProps) {
  const navigate = useNavigate()
  const [species, setSpecies] = useState('')
  const [district, setDistrict] = useState('')
  const [query, setQuery] = useState('')

  const { data: speciesList = [] } = useQuery<SpeciesOption[]>({
    queryKey: ['species'],
    queryFn: () => api.get('/search/species').then((r) => r.data),
    staleTime: 3600_000,
  })

  const { data: districtList = [] } = useQuery<DistrictOption[]>({
    queryKey: ['districts'],
    queryFn: () => api.get('/search/districts').then((r) => r.data),
    staleTime: 3600_000,
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (species) params.set('speciesId', species)
    if (district) params.set('districtId', district)
    if (query.trim()) params.set('query', query.trim())
    navigate(`/diretorio?${params.toString()}`)
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
          <label className="label">Espécie</label>
          <select
            className="select"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
          >
            <option value="">Todas as espécies</option>
            {speciesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.namePt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Distrito</label>
          <select
            className="select"
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
          <label className="label">Pesquisa</label>
          <input
            type="text"
            className="input"
            placeholder="Nome do criador..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <Button type="submit" variant="primary" className="w-full" size="lg">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            Pesquisar
          </Button>
        </div>
      </div>
    </form>
  )
}
