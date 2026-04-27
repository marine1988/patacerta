// ============================================
// PataCerta — Pagination (compact)
// ============================================
//
// Paginação minimalista de 3 elementos (Anterior · indicador · Seguinte),
// usada em listas de avaliações no painel e em páginas de detalhe.
// Não renderiza quando `totalPages <= 1`.
//
// Variantes:
//   - format="short"   → "{page} / {totalPages}"             (default)
//   - format="full"    → "Página {page} de {totalPages}"
//
//   - withBorder       → adiciona `mt-4 border-t border-gray-100 pt-4`
//                        (caso contrário usa apenas `pt-4`)

import { Button } from './Button'

interface PaginationProps {
  page: number
  totalPages: number
  onChange: (next: number) => void
  /** Desabilita os botões enquanto há um pedido em curso. */
  disabled?: boolean
  /** Etiqueta "Página X de Y" vs. "X / Y" (default short). */
  format?: 'short' | 'full'
  /** Adiciona margem superior + linha separadora. */
  withBorder?: boolean
}

export function Pagination({
  page,
  totalPages,
  onChange,
  disabled = false,
  format = 'short',
  withBorder = false,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const wrapperClass = withBorder
    ? 'mt-4 flex items-center justify-between border-t border-gray-100 pt-4'
    : 'flex items-center justify-between pt-4'

  const label = format === 'full' ? `Página ${page} de ${totalPages}` : `${page} / ${totalPages}`

  return (
    <div className={wrapperClass}>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        Anterior
      </Button>
      <span className="text-xs text-gray-500">{label}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Seguinte
      </Button>
    </div>
  )
}
