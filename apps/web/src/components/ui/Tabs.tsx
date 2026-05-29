import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface Tab {
  id: string
  label: string
  icon?: ReactNode
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  onChange?: (tabId: string) => void
}

export function Tabs({ tabs, defaultTab, onChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '')
  const baseId = useId()
  const listRef = useRef<HTMLDivElement | null>(null)
  // Mostra fade indicador enquanto a tab bar transborda horizontalmente.
  // Em vez de breakpoint fixo (sm:/lg:), reagimos ao tamanho real do
  // viewport — cobre o caso em que adicionar/remover tabs (criador,
  // destaque, serviços, recebidas) muda a largura total.
  const [hasOverflow, setHasOverflow] = useState(false)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    window.addEventListener('resize', check)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [tabs.length])

  function handleTabChange(tabId: string) {
    setActiveTab(tabId)
    onChange?.(tabId)
  }

  const activeContent = tabs.find((t) => t.id === activeTab)?.content

  return (
    <div>
      <div className="relative border-b border-line">
        {/* Fade lateral sinaliza que ha' mais tabs scrollaveis.
            Visivel sempre que houver overflow, independentemente do breakpoint. */}
        {hasOverflow && (
          <div
            className="pointer-events-none absolute right-0 top-0 z-10 h-full w-6 bg-gradient-to-l from-bg to-transparent"
            aria-hidden="true"
          />
        )}
        <div
          ref={listRef}
          role="tablist"
          aria-label="Tabs"
          className="-mb-px flex gap-6 overflow-x-auto scroll-smooth pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`${baseId}-tab-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-caramel-600 text-caramel-600'
                    : 'border-transparent text-muted hover:border-line hover:text-ink'
                }`}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
      <div
        id={`${baseId}-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeTab}`}
        tabIndex={0}
        className="pt-6"
      >
        {activeContent}
      </div>
    </div>
  )
}
