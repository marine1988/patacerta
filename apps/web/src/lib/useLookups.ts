// ============================================
// PataCerta — Hooks de catálogos estáticos
// ============================================
//
// Catálogos (raças, distritos, municípios, categorias de serviço,
// espécies) raramente mudam. Centralizamos os fetches num único hook
// por catálogo para reaproveitar cache em toda a aplicação.
//
// Backend tem cache TTL 1h em `/breeds` e `/search/districts`; aqui
// adicionamos `staleTime: Infinity` para evitar refetches desnecessários
// durante a sessão. Quando precisares forçar refetch, usa
// `queryClient.invalidateQueries({ queryKey: queryKeys.<catálogo>() })`.

import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { queryKeys } from './queryKeys'
import { STATIC_QUERY_DEFAULTS } from './queryDefaults'
import type {
  DistrictOption,
  MunicipalityOption,
  ServiceCategoryOption,
  SpeciesOption,
} from './lookups'

export interface BreedOption {
  id: number
  nameSlug: string
  namePt: string
  fciGroup: string | null
}

export function useBreeds() {
  return useQuery<BreedOption[]>({
    queryKey: queryKeys.breeds(),
    queryFn: () => api.get('/breeds').then((r) => r.data),
    ...STATIC_QUERY_DEFAULTS,
  })
}

export function useDistricts() {
  return useQuery<DistrictOption[]>({
    queryKey: queryKeys.districts(),
    queryFn: () => api.get('/search/districts').then((r) => r.data),
    ...STATIC_QUERY_DEFAULTS,
  })
}

export function useMunicipalities(districtId: number | string | null | undefined) {
  return useQuery<MunicipalityOption[]>({
    queryKey: queryKeys.municipalities(districtId),
    queryFn: () => api.get(`/search/districts/${districtId}/municipalities`).then((r) => r.data),
    enabled: !!districtId,
    ...STATIC_QUERY_DEFAULTS,
  })
}

export function useServiceCategories() {
  return useQuery<ServiceCategoryOption[]>({
    queryKey: queryKeys.serviceCategories(),
    queryFn: () => api.get('/services/categories').then((r) => r.data),
    ...STATIC_QUERY_DEFAULTS,
  })
}

export function useSpecies() {
  return useQuery<SpeciesOption[]>({
    queryKey: queryKeys.species(),
    queryFn: () => api.get('/species').then((r) => r.data),
    ...STATIC_QUERY_DEFAULTS,
  })
}
