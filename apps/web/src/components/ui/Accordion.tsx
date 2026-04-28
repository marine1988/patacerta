import { useState, type ReactNode } from 'react'

/**
 * Accordion ligeiro com seccoes colapsaveis. Sem dependencias externas:
 * usa <details> nativo para ter comportamento acessivel "out of the box"
 * (teclado + screen readers tratam-no como disclosure widget).
 *
 * Visual alinhado com o resto do site: cantos rectos (2px), borda fina,
 * fundo cream-tint, font-serif Lora no titulo, eyebrow caramel em italic.
 *
 * Uso:
 *   <Accordion>
 *     <AccordionSection title="Identificacao" defaultOpen>
 *       <Input ... />
 *     </AccordionSection>
 *     <AccordionSection title="Localizacao">...</AccordionSection>
 *   </Accordion>
 */

export function Accordion({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`space-y-3 ${className}`}>{children}</div>
}

export function AccordionSection({
  title,
  eyebrow,
  defaultOpen = false,
  open: openProp,
  onToggle,
  children,
}: {
  title: string
  /** Texto pequeno acima do titulo (estilo editorial). Opcional. */
  eyebrow?: string
  defaultOpen?: boolean
  /** Modo controlado: se passado, sobrepoe o estado interno. */
  open?: boolean
  /** Modo controlado: callback quando o utilizador clica no header. */
  onToggle?: () => void
  children: ReactNode
}) {
  // Usamos estado controlado em vez de <details> nativo porque queremos
  // animar a chevron e ter controlo total do styling do summary, e o
  // <details>/<summary> tem inconsistencias entre browsers para customizar
  // o marker.
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen
  const handleClick = () => {
    if (isControlled) {
      onToggle?.()
    } else {
      setInternalOpen((v) => !v)
    }
  }

  return (
    <div className="border border-line bg-white" style={{ borderRadius: 2 }}>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-cream-50"
        aria-expanded={open}
      >
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-caramel-500">
              <span>◆</span>
              <span className="italic">{eyebrow}</span>
            </div>
          )}
          <h3 className="font-serif text-lg text-ink">{title}</h3>
        </div>
        <svg
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && <div className="border-t border-line px-5 py-5">{children}</div>}
    </div>
  )
}
