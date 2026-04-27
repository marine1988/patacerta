// ============================================
// PataCerta — Pagination
// ============================================
//
// Variantes:
//   - variant="compact" (default)   → "Anterior · {indicador} · Seguinte"
//                                     Não renderiza se totalPages <= 1.
//   - variant="summary"             → "A mostrar X–Y de N · [Anterior][Próximo]"
//                                     Renderiza sempre (mostra 0 quando vazio).
//
// Indicadores (apenas compact):
//   - format="short"  → "X / Y"             (default)
//   - format="full"   → "Página X de Y"
//
// Espaçamento (apenas compact):
//   - withBorder      → `mt-4 border-t border-gray-100 pt-4`
//                       (caso contrário usa apenas `pt-4`)

import { Button } from './Button'
import type { PaginatedMeta } from '../../lib/pagination'

interface BaseProps {
  page: number
  onChange: (next: number) => void
  /** Desabilita os botões enquanto há um pedido em curso. */
  disabled?: boolean
}

interface CompactProps extends BaseProps {
  variant?: 'compact'
  totalPages: number
  /** Etiqueta "Página X de Y" vs. "X / Y" (default short). */
  format?: 'short' | 'full'
  /** Adiciona margem superior + linha separadora. */
  withBorder?: boolean
  meta?: never
}

interface SummaryProps extends BaseProps {
  variant: 'summary'
  /** Inclui contagens para "A mostrar X–Y de N resultados". */
  meta: PaginatedMeta
  totalPages?: never
  format?: never
  withBorder?: never
}

type PaginationProps = CompactProps | SummaryProps

export function Pagination(props: PaginationProps) {
  if (props.variant === 'summary') {
    return <PaginationSummary {...props} />
  }
  return <PaginationCompact {...props} />
}

function PaginationCompact({
  page,
  totalPages,
  onChange,
  disabled = false,
  format = 'short',
  withBorder = false,
}: CompactProps) {
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

function PaginationSummary({ page, meta, onChange, disabled = false }: SummaryProps) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1
  const to = Math.min(meta.page * meta.limit, meta.total)

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-gray-500">
        A mostrar {from}–{to} de {meta.total} resultados
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page >= meta.totalPages}
          onClick={() => onChange(page + 1)}
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}
