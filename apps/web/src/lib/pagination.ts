// ============================================
// PataCerta — Tipos de paginação partilhados
// ============================================
//
// Espelha a forma `{ data: T[], meta: { page, limit, total, totalPages } }`
// devolvida pela API para listagens paginadas.

export interface PaginatedMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface Paginated<T> {
  data: T[]
  meta: PaginatedMeta
}
