import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer } from 'react-leaflet'
import { api } from '../../lib/api'
import { PORTUGAL_CENTER, PORTUGAL_ZOOM } from '../../lib/leaflet-setup'
import { MarkerClusterLayer, type MapMarker } from '../../components/map/MarkerClusterLayer'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import type { DistrictOption } from '../../lib/lookups'

interface MapBreederResult {
  id: number
  businessName: string
  status: string
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
  avgRating: number | null
  reviewCount: number
  latitude: number
  longitude: number
}

interface MapBreedersResponse {
  data: MapBreederResult[]
  total: number
}

interface Props {
  searchParams: URLSearchParams
  setSearchParams: (params: URLSearchParams) => void
}

export function BreedersMapView({ searchParams, setSearchParams }: Props) {
  const districtId = searchParams.get('districtId') || ''
  const breedId = searchParams.get('breedId') || ''
  const query = searchParams.get('query') || ''

  const { data: districtsList = [] } = useQuery<DistrictOption[]>({
    queryKey: ['districts'],
    queryFn: () => api.get('/search/districts').then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  })

  const { data: breedsList = [] } = useQuery<{ id: number; namePt: string }[]>({
    queryKey: ['breeds'],
    queryFn: () => api.get('/breeds').then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  })

  const { data, isLoading, isError } = useQuery<MapBreedersResponse>({
    queryKey: ['breeders-map', { districtId, breedId, query }],
    queryFn: () =>
      api
        .get('/search/breeders/map', {
          params: {
            districtId: districtId || undefined,
            breedId: breedId || undefined,
            query: query || undefined,
          },
        })
        .then((r) => r.data),
  })

  const markers: MapMarker[] = useMemo(() => {
    return (data?.data ?? []).map((b) => ({
      id: b.id,
      lat: b.latitude,
      lng: b.longitude,
      businessName: b.businessName,
      districtName: b.district.namePt,
      municipalityName: b.municipality.namePt,
      avgRating: b.avgRating,
      reviewCount: b.reviewCount,
      speciesLabels: [],
    }))
  }, [data])

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const q = String(form.get('query') || '').trim()
    updateFilter('query', q)
  }

  function clearFilters() {
    // Mantém vista=mapa
    const next = new URLSearchParams()
    if (searchParams.get('vista')) next.set('vista', searchParams.get('vista')!)
    setSearchParams(next)
  }

  const hasFilters = Boolean(districtId || breedId || query)

  return (
    <>
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col gap-3 md:flex-row md:items-end"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">Pesquisar</label>
            <Input name="query" defaultValue={query} placeholder="Nome ou descrição..." />
          </div>
          <div className="md:w-56">
            <label className="mb-1 block text-xs font-medium text-gray-700">Distrito</label>
            <Select
              value={districtId}
              onChange={(e) => updateFilter('districtId', e.target.value)}
              options={[
                { value: '', label: 'Todos' },
                ...districtsList.map((d) => ({ value: String(d.id), label: d.namePt })),
              ]}
            />
          </div>
          <div className="md:w-56">
            <label className="mb-1 block text-xs font-medium text-gray-700">Raça</label>
            <Select
              value={breedId}
              onChange={(e) => updateFilter('breedId', e.target.value)}
              options={[
                { value: '', label: 'Todas' },
                ...breedsList.map((b) => ({ value: String(b.id), label: b.namePt })),
              ]}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              Pesquisar
            </Button>
            {hasFilters && (
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Limpar
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <p className="text-gray-600">
          {isLoading ? (
            'A carregar...'
          ) : (
            <>
              <span className="font-semibold text-gray-900">{data?.total ?? 0}</span> criadores no
              mapa
            </>
          )}
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isError ? (
          <div className="flex h-[500px] items-center justify-center">
            <EmptyState
              title="Erro ao carregar mapa"
              description="Não foi possível carregar os criadores. Tente recarregar a página."
            />
          </div>
        ) : (
          <div className="relative h-[70vh] min-h-[500px] w-full">
            {isLoading && (
              <div className="pointer-events-none absolute right-4 top-4 z-[1000] rounded-md bg-white/90 px-3 py-2 shadow">
                <Spinner size="sm" />
              </div>
            )}
            <MapContainer
              center={PORTUGAL_CENTER}
              zoom={PORTUGAL_ZOOM}
              minZoom={6}
              maxZoom={18}
              scrollWheelZoom
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MarkerClusterLayer markers={markers} />
            </MapContainer>
          </div>
        )}
      </div>
    </>
  )
}
