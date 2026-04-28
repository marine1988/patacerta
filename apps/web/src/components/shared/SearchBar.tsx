import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button } from '../ui/Button'
import type { DistrictOption } from '../../lib/lookups'

interface SearchBarProps {
  compact?: boolean
}

export function SearchBar({ compact = false }: SearchBarProps) {
  const navigate = useNavigate()
  const [district, setDistrict] = useState('')
  const [query, setQuery] = useState('')

  const { data: districtList = [] } = useQuery<DistrictOption[]>({
    queryKey: ['districts'],
    queryFn: () => api.get('/search/districts').then((r) => r.data),
    staleTime: 3600_000,
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (district) params.set('districtId', district)
    if (query.trim()) params.set('query', query.trim())
    navigate(`/explorar?${params.toString()}`)
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label">Distrito</label>
          <select className="select" value={district} onChange={(e) => setDistrict(e.target.value)}>
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
