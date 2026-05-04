import { Link } from 'react-router-dom'

/**
 * `<Breadcrumbs>` — componente partilhado que renderiza navegacao
 * hierarquica visual + emite o estilo semantico correcto para SEO.
 *
 * O JSON-LD `BreadcrumbList` correspondente deve ser emitido
 * separadamente via `breadcrumbListJsonLd(items)` no `usePageMeta`. Isto
 * mantem o JSON-LD na head (onde Google espera) e nao polui o DOM com
 * scripts inline em cada pagina.
 *
 * Convencao: o ultimo item e' a pagina actual e nao deve ser link.
 * Recebemos `items` como `{ name, path }[]` igual ao helper JSON-LD,
 * para garantir paridade entre o que Google ve e o que o utilizador ve
 * (Google penaliza divergencia visual vs schema).
 */
export interface BreadcrumbItem {
  name: string
  path: string
}

interface Props {
  items: BreadcrumbItem[]
  /** Classes extra para o `<nav>` exterior. */
  className?: string
}

export function Breadcrumbs({ items, className }: Props) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Caminho de navegação" className={`text-xs text-muted ${className ?? ''}`}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.path}-${index}`} className="flex items-center gap-1">
              {isLast ? (
                <span aria-current="page" className="font-medium text-ink">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link
                    to={item.path}
                    className="text-muted transition-colors hover:text-caramel-600 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span aria-hidden="true" className="select-none text-muted/60">
                    ›
                  </span>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
