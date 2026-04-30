import { Link } from 'react-router-dom'
import { Badge } from '../ui/Badge'

interface BreederCardProps {
  id: number
  businessName: string
  description?: string | null
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
  status: string
  photos?: Array<{ id: number; url: string; sortOrder: number }>
  avgRating?: number | null
  reviewCount?: number
}

export function BreederCard({
  id,
  businessName,
  description,
  district,
  municipality,
  status,
  photos,
  avgRating,
  reviewCount,
}: BreederCardProps) {
  const cover = photos?.[0]?.url ?? null

  return (
    <Link
      to={`/criador/${id}`}
      className="card block overflow-hidden transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
            sem foto
          </div>
        )}
        {status === 'VERIFIED' && (
          <span className="absolute left-2 top-2">
            <Badge variant="green">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              Verificado
            </Badge>
          </span>
        )}
        {status === 'PENDING_VERIFICATION' && (
          <span className="absolute left-2 top-2">
            <Badge variant="yellow">Pendente</Badge>
          </span>
        )}
      </div>
      <div className="card-body">
        <h2 className="line-clamp-2 text-base font-semibold text-gray-900">{businessName}</h2>

        <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
          <svg
            className="h-3.5 w-3.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z"
            />
          </svg>
          <span>
            {municipality.namePt}, {district.namePt}
          </span>
        </div>

        {avgRating != null && (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-yellow-600">{avgRating}</span>
            <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {reviewCount != null && <span className="text-gray-400">({reviewCount})</span>}
          </div>
        )}

        {description && <p className="mt-2 line-clamp-2 text-sm text-gray-600">{description}</p>}
      </div>
    </Link>
  )
}

/**
 * Skeleton com a mesma shape do `BreederCard` para usar enquanto o fetch
 * inicial nao chegou (evita salto de layout vs spinner generico).
 */
export function BreederCardSkeleton() {
  return (
    <div className="card block animate-pulse overflow-hidden">
      <div className="aspect-[4/3] w-full bg-gray-200" />
      <div className="card-body space-y-2">
        <div className="h-5 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-1/2 rounded bg-gray-200" />
        <div className="space-y-1.5 pt-1">
          <div className="h-3 w-full rounded bg-gray-200" />
          <div className="h-3 w-4/5 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  )
}
