import type { ReactNode } from 'react'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'blue' | 'gray'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  icon?: ReactNode
  className?: string
  title?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  green: 'badge-green',
  yellow: 'badge-yellow',
  red: 'badge-red',
  blue: 'badge-blue',
  gray: 'badge-gray',
}

export function Badge({ variant = 'gray', children, icon, className = '', title }: BadgeProps) {
  return (
    <span className={`${variantClasses[variant]} ${className}`} title={title}>
      {icon}
      {children}
    </span>
  )
}
