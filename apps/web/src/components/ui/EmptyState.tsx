import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /**
   * HTML heading level for the title. Defaults to `h3`.
   * Use `h2` when the EmptyState is the primary content of a page or
   * tabpanel whose only ancestor heading is an `h1`.
   */
  titleAs?: 'h2' | 'h3' | 'h4'
}

export function EmptyState({ icon, title, description, action, titleAs = 'h3' }: EmptyStateProps) {
  const TitleTag = titleAs
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-3xl text-subtle">
          {icon}
        </div>
      )}
      <TitleTag className="text-lg font-semibold text-ink">{title}</TitleTag>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
