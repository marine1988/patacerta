/**
 * FeatureToggle — controlo de promocao na homepage.
 *
 * Permite ao admin promover (1/7/30/90 dias) ou despromover um item.
 * Usado tanto na tabela de criadores como na de servicos.
 *
 * Recebe o `featuredUntil` actual e callbacks para set/clear; mantém-se
 * "burro" — toda a logica de mutate/invalidate fica nos consumers.
 */

const FEATURE_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1, label: '1 dia' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
]

export function FeatureToggle({
  featuredUntil,
  isPending,
  onSet,
  onClear,
  size = 'sm',
}: {
  featuredUntil: string | null | undefined
  isPending: boolean
  onSet: (days: number) => void
  onClear: () => void
  size?: 'sm' | 'md'
}) {
  const isPromoted = featuredUntil != null && new Date(featuredUntil) > new Date()
  const sizeClasses = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className={`flex flex-wrap items-center gap-2 ${sizeClasses}`}>
      {isPromoted ? (
        <>
          <span className="inline-flex items-center gap-1 rounded bg-caramel-50 px-2 py-0.5 font-medium text-caramel-700">
            <span className="h-1.5 w-1.5 rounded-full bg-caramel-500" />
            Destaque até {new Date(featuredUntil!).toLocaleDateString('pt-PT')}
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm('Remover destaque agora?')) onClear()
            }}
            className="text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Remover
          </button>
        </>
      ) : (
        <>
          <span className="text-gray-500">Promover:</span>
          {FEATURE_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              disabled={isPending}
              onClick={() => onSet(p.days)}
              className="rounded border border-gray-300 px-2 py-0.5 hover:border-caramel-500 hover:text-caramel-700 disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </>
      )}
    </div>
  )
}
