import { StarRating } from '../shared/StarRating'

interface RatingHistogramProps {
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
  total: number
  avgRating: number | null
}

export function RatingHistogram({ distribution, total, avgRating }: RatingHistogramProps) {
  const stars: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1]

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div className="flex flex-col items-center sm:items-start">
        <div className="text-4xl font-bold text-gray-900">{avgRating?.toFixed(1) ?? '—'}</div>
        <StarRating rating={Math.round(avgRating ?? 0)} size="md" />
        <p className="mt-1 text-sm text-gray-500">
          {total} {total === 1 ? 'avaliação' : 'avaliações'}
        </p>
      </div>

      <div className="flex-1 space-y-1.5">
        {stars.map((star) => {
          const count = distribution[star] ?? 0
          const percent = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-gray-600">{star}★</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-yellow-400"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="w-10 text-right text-gray-500">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
