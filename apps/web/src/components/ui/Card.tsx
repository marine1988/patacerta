import type { ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: boolean
  hover?: boolean
}

export function Card({
  children,
  padding = true,
  hover = true,
  className = '',
  ...props
}: CardProps) {
  return (
    <div className={`card ${hover ? 'card-hover hover:shadow-sm' : ''} ${className}`} {...props}>
      {padding ? <div className="card-body">{children}</div> : children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between border-b border-line px-4 py-3 md:px-5 md:py-4">
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
