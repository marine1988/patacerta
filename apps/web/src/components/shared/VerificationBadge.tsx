import { Badge } from '../ui/Badge'

interface VerificationBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

const statusConfig: Record<string, { variant: 'green' | 'yellow' | 'red' | 'gray'; label: string }> = {
  VERIFIED: { variant: 'green', label: 'Verificado DGAV' },
  PENDING_VERIFICATION: { variant: 'yellow', label: 'Em verificação' },
  DRAFT: { variant: 'gray', label: 'Rascunho' },
  SUSPENDED: { variant: 'red', label: 'Suspenso' },
  APPROVED: { variant: 'green', label: 'Aprovado' },
  PENDING: { variant: 'yellow', label: 'Pendente' },
  REJECTED: { variant: 'red', label: 'Rejeitado' },
}

export function VerificationBadge({ status }: VerificationBadgeProps) {
  const config = statusConfig[status] || { variant: 'gray' as const, label: status }

  return (
    <Badge variant={config.variant}>
      {config.variant === 'green' && (
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {config.label}
    </Badge>
  )
}
