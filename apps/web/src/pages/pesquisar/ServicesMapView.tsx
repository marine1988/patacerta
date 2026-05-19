import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Circle, CircleMarker, useMap } from 'react-leaflet'
import { api } from '../../lib/api'
import { PORTUGAL_CENTER, PORTUGAL_ZOOM } from '../../lib/leaflet-setup'
import {
  ServiceMarkerClusterLayer,
  type ServiceMapMarker,
} from '../../components/map/ServiceMarkerClusterLayer'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useDistricts, useServiceCategories } from '../../lib/useLookups'
import { useItemListJsonLd } from '../../hooks/useItemListJsonLd'

interface MapServiceResult {
  id: number
  slug: string | null
  title: string
  priceCents: number
  priceUnit: 'FIXED' | 'HOURLY' | 'PER_SESSION'
  latitude: number
  longitude: number
  category: { id: number; nameSlug: string; namePt: string }
}

interface MapServicesResponse {
  data: MapServiceResult[]
  total: number
}

interface Props {
  searchParams: URLSearchParams
  setSearchParams: (params: URLSearchParams) => void
}

/**
 * Componente filho do MapContainer que centra o mapa
 * sempre que `target` muda (ex: utilizador pediu "a minha localização").
 */
function MapAutoCenter({ target, zoom }: { target: [number, number] | null; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (target) {
      map.setView(target, zoom, { animate: true })
    }
  }, [map, target, zoom])
  return null
}

/**
 * Distância Haversine em km entre dois pontos. Suficientemente precisa
 * para filtrar markers num raio à escala nacional (erro &lt; 0.5%).
 */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function ServicesMapView({ searchParams, setSearchParams }: Props) {
  const categoryId = searchParams.get('categoryId') || ''
  const districtId = searchParams.get('districtId') || ''
  const municipalityId = searchParams.get('municipalityId') || ''
  const query = searchParams.get('query') || ''
  const priceMin = searchParams.get('priceMin') || ''
  const priceMax = searchParams.get('priceMax') || ''

  const geo = useGeolocation()
  const radiusKm = 25

  const { data: categories = [] } = useServiceCategories()

  const { data: districtsList = [] } = useDistricts()

  /**
   * Converte texto em € para cêntimos inteiros, ou `undefined` se inválido.
   * Evita enviar `priceMin=NaN` quando o utilizador escreve texto.
   */
  function priceParamToCents(raw: string): number | undefined {
    if (!raw) return undefined
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return undefined
    return Math.round(n * 100)
  }
  const priceMinValid = priceMin === '' || priceParamToCents(priceMin) !== undefined
  const priceMaxValid = priceMax === '' || priceParamToCents(priceMax) !== undefined
  const priceRangeValid = (() => {
    const mn = priceParamToCents(priceMin)
    const mx = priceParamToCents(priceMax)
    if (mn !== undefined && mx !== undefined && mn > mx) return false
    return true
  })()
  const filtersValid = priceMinValid && priceMaxValid && priceRangeValid

  const { data, isLoading, isError, refetch } = useQuery<MapServicesResponse>({
    queryKey: [
      'services-map',
      { categoryId, districtId, municipalityId, query, priceMin, priceMax },
    ],
    queryFn: () =>
      api
        .get('/services/map', {
          params: {
            categoryId: categoryId || undefined,
            districtId: districtId || undefined,
            municipalityId: municipalityId || undefined,
            q: query || undefined,
            priceMin: priceParamToCents(priceMin),
            priceMax: priceParamToCents(priceMax),
          },
        })
        .then((r) => r.data),
    enabled: filtersValid,
  })

  const markers: ServiceMapMarker[] = useMemo(() => {
    const all = (data?.data ?? []).map((s) => ({
      id: s.id,
      slug: s.slug,
      lat: s.latitude,
      lng: s.longitude,
      title: s.title,
      categoryName: s.category.namePt,
      priceCents: s.priceCents,
      priceUnit: s.priceUnit,
    }))
    // Filtro geográfico client-side: o endpoint `/services/map` aceita
    // bbox mas não raio em km. Quando o utilizador activa "A minha
    // localização", reduzimos os markers ao raio configurado para que
    // o círculo azul reflicta os resultados visíveis no mapa.
    if (geo.coords) {
      const { lat, lng } = geo.coords
      return all.filter((m) => haversineKm(lat, lng, m.lat, m.lng) <= radiusKm)
    }
    return all
  }, [data, geo.coords])

  // ItemList JSON-LD para a vista Mapa de serviços. Limitar a 50 para
  // payloads razoáveis. Ajuda Google e LLMs a entender que esta URL
  // (`?tipo=servicos&vista=mapa`) é uma listagem estruturada.
  useItemListJsonLd(
    (data?.data ?? []).slice(0, 50).map((s) => ({
      path: `/servicos/${s.slug ?? s.id}`,
      name: s.title,
    })),
    'Serviços para Cães em Portugal',
  )

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
    const pMin = String(form.get('priceMin') || '').trim()
    const pMax = String(form.get('priceMax') || '').trim()
    const next = new URLSearchParams(searchParams)
    if (q) next.set('query', q)
    else next.delete('query')
    if (pMin) next.set('priceMin', pMin)
    else next.delete('priceMin')
    if (pMax) next.set('priceMax', pMax)
    else next.delete('priceMax')
    setSearchParams(next)
  }

  function clearFilters() {
    const next = new URLSearchParams()
    next.set('tipo', 'servicos')
    if (searchParams.get('vista')) next.set('vista', searchParams.get('vista')!)
    setSearchParams(next)
    geo.clear()
  }

  const hasFilters = Boolean(
    categoryId || districtId || municipalityId || query || priceMin || priceMax,
  )

  const userTarget: [number, number] | null = geo.coords ? [geo.coords.lat, geo.coords.lng] : null

  return (
    <>
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">Pesquisar</label>
              <Input name="query" defaultValue={query} placeholder="Título ou descrição..." />
            </div>
            <div className="md:w-56">
              <label className="mb-1 block text-xs font-medium text-gray-700">Categoria</label>
              <Select
                aria-label="Categoria"
                value={categoryId}
                onChange={(e) => updateFilter('categoryId', e.target.value)}
                options={[
                  { value: '', label: 'Todas' },
                  ...categories.map((c) => ({ value: String(c.id), label: c.namePt })),
                ]}
              />
            </div>
            <div className="md:w-56">
              <label className="mb-1 block text-xs font-medium text-gray-700">Distrito</label>
              <Select
                aria-label="Distrito"
                value={districtId}
                onChange={(e) => updateFilter('districtId', e.target.value)}
                options={[
                  { value: '', label: 'Todos' },
                  ...districtsList.map((d) => ({ value: String(d.id), label: d.namePt })),
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
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
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary">
                Aplicar
              </Button>
              {geo.coords ? (
                <Button type="button" variant="secondary" onClick={() => geo.clear()}>
                  Remover localização
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => geo.request()}
                  disabled={geo.loading}
                >
                  {geo.loading ? (
                    'A localizar...'
                  ) : (
                    <>
                      <span aria-hidden>📍</span> A minha localização
                    </>
                  )}
                </Button>
              )}
              {hasFilters && (
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {!filtersValid && (
            <p className="text-sm text-red-600">
              {!priceMinValid || !priceMaxValid
                ? 'Indique um preço válido (apenas números, sem texto).'
                : 'O preço mínimo não pode ser superior ao máximo.'}
            </p>
          )}
          {geo.error && <p className="text-xs text-red-600">{geo.error}</p>}
        </form>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="text-gray-600">
          {isLoading ? (
            <Skeleton height="h-4" width="w-48" />
          ) : geo.coords ? (
            <p>
              <span className="font-semibold text-gray-900">{markers.length}</span> anúncios num
              raio de {radiusKm} km{' '}
              <span className="text-gray-400">(total nacional: {data?.total ?? 0})</span>
            </p>
          ) : (
            <p>
              <span className="font-semibold text-gray-900">{data?.total ?? 0}</span> anúncios no
              mapa
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isError ? (
          <div className="flex h-[500px] items-center justify-center">
            <EmptyState
              title="Erro ao carregar mapa"
              description="Não foi possível carregar os anúncios. Verifique a sua ligação e tente novamente."
              action={
                <Button onClick={() => refetch()} variant="primary">
                  Tentar de novo
                </Button>
              }
            />
          </div>
        ) : (
          <div className="relative h-[70vh] min-h-[500px] w-full">
            {isLoading && (
              <div className="pointer-events-none absolute right-4 top-4 z-[1000] rounded-md bg-white/90 px-3 py-2 shadow">
                <Spinner size="sm" />
              </div>
            )}
            <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] rounded-md bg-white/95 px-3 py-2 text-xs shadow">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: '#5b8a72' }}
                />
                <span className="text-gray-700">Serviço</span>
              </div>
              {geo.coords && (
                <div className="mt-1 flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
                    style={{ background: '#2563eb' }}
                  />
                  <span className="text-gray-700">A sua localização</span>
                </div>
              )}
            </div>
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
              <MapAutoCenter target={userTarget} zoom={11} />
              <ServiceMarkerClusterLayer markers={markers} />
              {userTarget && (
                <>
                  <CircleMarker
                    center={userTarget}
                    radius={8}
                    pathOptions={{
                      color: '#fff',
                      weight: 2,
                      fillColor: '#2563eb',
                      fillOpacity: 1,
                    }}
                  />
                  <Circle
                    center={userTarget}
                    radius={radiusKm * 1000}
                    pathOptions={{
                      color: '#2563eb',
                      weight: 1,
                      fillColor: '#2563eb',
                      fillOpacity: 0.05,
                    }}
                  />
                </>
              )}
            </MapContainer>
          </div>
        )}
      </div>
    </>
  )
}
