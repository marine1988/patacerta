// ============================================
// PataCerta — Tipos de lookups (opções de filtro)
// ============================================
//
// Espelham as listas devolvidas pela API para popular selects de
// distritos, espécies e categorias de serviço em SearchBar, MapPage,
// DirectoryPage etc.

/** Opção de distrito (lista do endpoint /districts). */
export interface DistrictOption {
  id: number
  code: string
  namePt: string
}

/** Opção de município (lista do endpoint /municipalities?district=...). */
export interface MunicipalityOption {
  id: number
  namePt: string
}

/** Opção de espécie (lista do endpoint /species). */
export interface SpeciesOption {
  id: number
  nameSlug: string
  namePt: string
}

/** Opção de categoria de serviço (lista do endpoint /service-categories). */
export interface ServiceCategoryOption {
  id: number
  nameSlug: string
  namePt: string
}
