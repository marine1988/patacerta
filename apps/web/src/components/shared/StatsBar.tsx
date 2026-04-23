interface Stat {
  label: string
  value: string
}

interface StatsBarProps {
  stats: Stat[]
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl bg-white/80 px-4 py-5 text-center backdrop-blur-sm">
          <p className="text-2xl font-bold text-caramel-600 sm:text-3xl">{stat.value}</p>
          <p className="mt-1 text-sm text-gray-600">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}
