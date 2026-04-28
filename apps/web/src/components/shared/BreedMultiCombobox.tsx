// ============================================
// PataCerta — Breed Multi Combobox (search + chips)
// ============================================
//
// Selector multi-raça com pesquisa fuzzy e chips removíveis. Usado
// nos formulários de criador (onboarding + dashboard) onde o catálogo
// ronda as 100 raças e um grid de checkboxes é pesado.
//
// UX:
//   - Input com pesquisa (normaliza acentos) abre dropdown filtrado.
//   - Setas ↑/↓ navegam, Enter selecciona, Esc fecha, Backspace com
//     input vazio remove o último chip.
//   - Selecção mostrada como chips (◆ caramel) com botão "×".
//   - Click fora fecha o dropdown.
//
// Acessibilidade: combobox role com aria-expanded/-controls e
// aria-activedescendant. Cada opção tem id estável.

import { useEffect, useId, useMemo, useRef, useState } from 'react'

interface BreedOption {
  id: number
  namePt: string
}

interface Props {
  breeds: BreedOption[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  placeholder?: string
  disabled?: boolean
}

// Normaliza para pesquisa case- e accent-insensitive.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function BreedMultiCombobox({
  breeds,
  selectedIds,
  onChange,
  placeholder = 'Pesquisar raça…',
  disabled = false,
}: Props) {
  const reactId = useId()
  const listboxId = `${reactId}-listbox`
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // Mapa rápido id → nome para os chips.
  const byId = useMemo(() => {
    const m = new Map<number, string>()
    for (const b of breeds) m.set(b.id, b.namePt)
    return m
  }, [breeds])

  // Lista filtrada: exclui já seleccionadas e aplica query.
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const selected = new Set(selectedIds)
    return breeds
      .filter((b) => !selected.has(b.id))
      .filter((b) => (q ? normalize(b.namePt).includes(q) : true))
      .slice(0, 50) // limita render
  }, [breeds, selectedIds, query])

  // Reset índice activo quando filtro muda.
  useEffect(() => {
    setActiveIndex(0)
  }, [query, filtered.length])

  // Click fora fecha dropdown.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function addBreed(id: number) {
    if (selectedIds.includes(id)) return
    onChange([...selectedIds, id])
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
  }

  function removeBreed(id: number) {
    onChange(selectedIds.filter((x) => x !== id))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault()
        addBreed(filtered[activeIndex].id)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && query === '' && selectedIds.length > 0) {
      removeBreed(selectedIds[selectedIds.length - 1])
    }
  }

  const activeOptionId = filtered[activeIndex]
    ? `${reactId}-opt-${filtered[activeIndex].id}`
    : undefined

  return (
    <div ref={containerRef} className="relative">
      {/* Caixa principal */}
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-2 shadow-sm focus-within:border-caramel-500 focus-within:ring-1 focus-within:ring-caramel-500 ${
          disabled ? 'opacity-60' : ''
        }`}
        onClick={() => {
          if (!disabled) {
            setOpen(true)
            inputRef.current?.focus()
          }
        }}
      >
        {selectedIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 bg-caramel-100 px-2 py-0.5 text-xs text-caramel-700"
            style={{ borderRadius: 2 }}
          >
            <span aria-hidden="true" className="text-caramel-500">
              ◆
            </span>
            <span>{byId.get(id) ?? `#${id}`}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeBreed(id)
              }}
              className="text-caramel-700 hover:text-caramel-900"
              aria-label={`Remover ${byId.get(id) ?? id}`}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selectedIds.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0"
          disabled={disabled}
        />
      </div>

      {/* Dropdown */}
      {open && !disabled && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">
              {query.trim()
                ? 'Sem resultados.'
                : selectedIds.length === breeds.length
                  ? 'Todas as raças seleccionadas.'
                  : 'Comece a escrever para pesquisar.'}
            </li>
          ) : (
            filtered.map((b, idx) => (
              <li
                key={b.id}
                id={`${reactId}-opt-${b.id}`}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  // mousedown (não click) para evitar blur do input antes de seleccionar
                  e.preventDefault()
                  addBreed(b.id)
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  idx === activeIndex
                    ? 'bg-caramel-50 text-caramel-700'
                    : 'text-gray-800 hover:bg-cream-50'
                }`}
              >
                {b.namePt}
              </li>
            ))
          )}
        </ul>
      )}

      {/* Contador */}
      {selectedIds.length > 0 && (
        <p className="mt-2 text-xs text-gray-600">
          {selectedIds.length}{' '}
          {selectedIds.length === 1 ? 'raça seleccionada' : 'raças seleccionadas'}.
        </p>
      )}
    </div>
  )
}
