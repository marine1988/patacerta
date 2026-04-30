import { useState, type ReactNode } from 'react'

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

  function handleTabChange(tabId: string) {
    setActiveTab(tabId)
    onChange?.(tabId)
  }

  const activeContent = tabs.find((t) => t.id === activeTab)?.content

  return (
    <div>
      <div className="relative border-b border-line">
        {/* Fade lateral em mobile sinaliza que ha' mais tabs scrollaveis. */}
        <div
          className="pointer-events-none absolute right-0 top-0 z-10 h-full w-6 bg-gradient-to-l from-bg to-transparent sm:hidden"
          aria-hidden="true"
        />
        <nav
          className="-mb-px flex gap-6 overflow-x-auto scroll-smooth pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Tabs"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-caramel-600 text-caramel-600'
                  : 'border-transparent text-muted hover:border-line hover:text-ink'
              }`}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="pt-6" role="tabpanel">
        {activeContent}
      </div>
    </div>
  )
}
