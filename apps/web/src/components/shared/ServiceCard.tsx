import { Link } from 'react-router-dom'
import { Badge } from '../ui/Badge'
import { formatPrice, type ServicePriceUnit } from '../../lib/format'

export interface ServiceCardData {
  id: number
  title: string
  description: string
  priceCents: number
  priceUnit: ServicePriceUnit
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
  category: { id: number; nameSlug: string; namePt: string }
  photos: Array<{ id: number; url: string; sortOrder: number }>
  avgRating?: number | null
  reviewCount?: number
  /** Distancia em km ao ponto de referencia, quando aplicavel. */
  distanceKm?: number | null
}

/** Formata distancia em km com pt-PT (1 casa decimal abaixo de 10 km). */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`
  return `${Math.round(km)} km`
}

export function ServiceCard({
  id,
  title,
  description,
  priceCents,
  priceUnit,
  district,
  municipality,
  category,
  photos,
  avgRating,
  reviewCount,
  distanceKm,
}: ServiceCardData) {
  const cover = photos[0]?.url ?? null

  return (
    <Link
      to={`/servicos/${id}`}
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
        {distanceKm != null && (
          <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm">
            {formatDistance(distanceKm)}
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="blue">{category.namePt}</Badge>
          <span className="text-base font-semibold text-gray-900 whitespace-nowrap">
            {formatPrice(priceCents, priceUnit)}
          </span>
        </div>

        <h3 className="mt-2 line-clamp-2 text-base font-semibold text-gray-900">{title}</h3>

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

        {avgRating != null && reviewCount != null && reviewCount > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-yellow-600">{avgRating.toFixed(1)}</span>
            <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-gray-400">({reviewCount})</span>
          </div>
        )}

        <p className="mt-2 line-clamp-2 text-sm text-gray-600">{description}</p>
      </div>
    </Link>
  )
}

/**
 * Skeleton com a mesma shape do `ServiceCard` para usar enquanto o fetch
 * inicial nao chegou (evita salto de layout vs spinner generico).
 */
export function ServiceCardSkeleton() {
  return (
    <div className="card block animate-pulse overflow-hidden">
      <div className="aspect-[4/3] w-full bg-gray-200" />
      <div className="card-body space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="h-5 w-20 rounded bg-gray-200" />
          <div className="h-5 w-16 rounded bg-gray-200" />
        </div>
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
