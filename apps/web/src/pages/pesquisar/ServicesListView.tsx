import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import {
  ServiceCard,
  ServiceCardSkeleton,
  type ServiceCardData,
} from '../../components/shared/ServiceCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { useGeolocation } from '../../hooks/useGeolocation'
import type { DistrictOption, MunicipalityOption, ServiceCategoryOption } from '../../lib/lookups'

interface ServicesPaginatedResponse {
  data: ServiceCardData[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

interface Props {
  searchParams: URLSearchParams
  setSearchParams: (params: URLSearchParams) => void
}

export function ServicesListView({ searchParams, setSearchParams }: Props) {
  const categoryId = searchParams.get('categoryId') || ''
  const districtId = searchParams.get('districtId') || ''
  const municipalityId = searchParams.get('municipalityId') || ''
  const query = searchParams.get('query') || ''
  const priceMin = searchParams.get('priceMin') || ''
  const priceMax = searchParams.get('priceMax') || ''
  const sort =
    (searchParams.get('sort') as 'recent' | 'price_asc' | 'price_desc' | 'distance') || 'recent'
  const radiusKm = searchParams.get('radiusKm') || ''

  const geo = useGeolocation()

  const [pages, setPages] = useState<ServiceCardData[][]>([])
  const [page, setPage] = useState(1)
  const limit = 12

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        categoryId,
        districtId,
        municipalityId,
        query,
        priceMin,
        priceMax,
        sort,
        radiusKm,
        lat: geo.coords ? Math.round(geo.coords.lat * 1000) / 1000 : null,
        lng: geo.coords ? Math.round(geo.coords.lng * 1000) / 1000 : null,
      }),
    [categoryId, districtId, municipalityId, query, priceMin, priceMax, sort, radiusKm, geo.coords],
  )

  useEffect(() => {
    setPages([])
    setPage(1)
  }, [filtersKey])

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

  const radiusActive = !!geo.coords && !!radiusKm && Number(radiusKm) > 0
  const effectiveSort: typeof sort = !radiusActive && sort === 'distance' ? 'recent' : sort

  const { data, isLoading, isFetching, isError, refetch } = useQuery<ServicesPaginatedResponse>({
    queryKey: ['services', filtersKey, page],
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
            lat: radiusActive ? geo.coords!.lat : undefined,
            lng: radiusActive ? geo.coords!.lng : undefined,
            radiusKm: radiusActive ? Number(radiusKm) : undefined,
            sort: effectiveSort,
            page,
            limit,
          },
        })
        .then((r) => r.data),
  })

  useEffect(() => {
    if (!data) return
    setPages((prev) => {
      const next = [...prev]
      next[page - 1] = data.data
      return next
    })
  }, [data, page])

  const meta = data?.meta
  const accumulated = pages.flat()
  const hasMore = !!meta && accumulated.length < meta.total

  function updateFilter(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
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
    geo.clear()
  }

  function handleUseLocation() {
    if (geo.coords) {
      geo.clear()
      const next = new URLSearchParams(searchParams)
      next.delete('radiusKm')
      if (sort === 'distance') next.set('sort', 'recent')
      next.delete('page')
      setSearchParams(next)
      return
    }
    geo.request()
  }

  useEffect(() => {
    if (geo.coords && !radiusKm) {
      const next = new URLSearchParams(searchParams)
      next.set('radiusKm', '25')
      next.delete('page')
      setSearchParams(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.coords])

  const hasFilters = Boolean(
    categoryId ||
    districtId ||
    municipalityId ||
    query ||
    priceMin ||
    priceMax ||
    radiusKm ||
    geo.coords,
  )

  const showInitialSkeleton = isLoading && pages.length === 0

  return (
    <>
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
                  ...(geo.coords && radiusKm ? [{ value: 'distance', label: 'Mais perto' }] : []),
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

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 md:flex-row md:items-end">
            <div className="flex-1">
              <Button
                type="button"
                variant={geo.coords ? 'primary' : 'secondary'}
                onClick={handleUseLocation}
                loading={geo.loading}
              >
                {geo.coords ? '✓ A usar a sua localização' : 'Usar a minha localização'}
              </Button>
              {geo.error && <p className="mt-1 text-xs text-red-600">{geo.error}</p>}
              {!geo.coords && !geo.error && (
                <p className="mt-1 text-xs text-gray-500">
                  Mostra anúncios perto de si. A localização não é guardada.
                </p>
              )}
            </div>
            {geo.coords && (
              <div className="md:w-48">
                <label className="mb-1 block text-xs font-medium text-gray-700">Raio</label>
                <Select
                  value={radiusKm || '25'}
                  onChange={(e) => updateFilter({ radiusKm: e.target.value })}
                  options={[
                    { value: '5', label: '5 km' },
                    { value: '10', label: '10 km' },
                    { value: '25', label: '25 km' },
                    { value: '50', label: '50 km' },
                    { value: '100', label: '100 km' },
                  ]}
                />
              </div>
            )}
          </div>
        </form>
      </div>

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
      </div>

      {showInitialSkeleton ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ServiceCardSkeleton key={i} />
          ))}
        </div>
      ) : isError && pages.length === 0 ? (
        <EmptyState
          title="Erro ao carregar anúncios"
          description="Ocorreu um erro ao pesquisar. Tente novamente."
          action={
            <Button variant="primary" onClick={() => refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : meta && meta.total === 0 ? (
        hasFilters ? (
          <EmptyState
            title="Nenhum anúncio encontrado"
            description="Tente alargar os filtros ou ver no mapa."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Ainda não há anúncios disponíveis"
            description="Seja o primeiro a anunciar um serviço para patudos."
            action={
              <Link to="/painel?tab=servicos" className="btn-primary">
                Criar o meu anúncio
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accumulated.map((s) => (
              <ServiceCard key={s.id} {...s} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => p + 1)}
                loading={isFetching && page > 1}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
