// ============================================
// PataCerta — Sponsored Breeders Strip
// ============================================
//
// Cards compactos de criadores patrocinados, mostrados sob cada raça
// no resultado do simulador. Tem label "Patrocinado" obrigatório
// (DL 57/2008 publicidade transparente). Tracking de cliques via
// POST /api/sponsored-slots/:slotId/click — best-effort, não bloqueia
// a navegação.

import { Link } from 'react-router-dom'
import type { SponsoredBreederMini } from '@patacerta/shared'
import { api } from '../../lib/api'
import { StarRating } from './StarRating'

interface Props {
  breeders: SponsoredBreederMini[]
  /** Slug da raça para o link "Ver todos os criadores". */
  breedId: number
  breedNamePt: string
}

function trackClick(slotId: number) {
  // Best-effort — nunca bloqueia navegação. Falhas silenciosas.
  api.post(`/sponsored-slots/${slotId}/click`).catch(() => {
    /* intencional */
  })
}

export function SponsoredBreedersStrip({ breeders, breedId, breedNamePt }: Props) {
  if (breeders.length === 0) return null

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="eyebrow-muted">
          ◆ <span className="italic text-caramel-500">Criadores recomendados</span>
        </p>
        <Link
          to={`/pesquisar?breedId=${breedId}`}
          className="text-xs text-caramel-500 hover:underline"
        >
          Ver todos os criadores de {breedNamePt} →
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {breeders.map((b) => (
          <li key={b.slotId}>
            <Link
              to={`/criador/${b.breederId}`}
              onClick={() => trackClick(b.slotId)}
              className="group flex items-center gap-3 rounded border border-line bg-white p-3 transition-colors hover:border-caramel-300 hover:bg-cream-50"
              style={{ borderRadius: 2 }}
            >
              {b.coverPhotoUrl ? (
                <img
                  src={b.coverPhotoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 object-cover"
                  style={{ borderRadius: 2 }}
                  loading="lazy"
                />
              ) : (
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center bg-cream-100 text-caramel-500"
                  style={{ borderRadius: 2 }}
                  aria-hidden="true"
                >
                  <span className="font-serif text-lg">
                    {b.businessName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block bg-caramel-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-caramel-700"
                    style={{ borderRadius: 2 }}
                  >
                    Patrocinado
                  </span>
                </div>
                <p className="mt-1 truncate font-medium text-ink group-hover:text-caramel-600">
                  {b.businessName}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <span className="truncate">
                    {b.municipality.namePt}, {b.district.namePt}
                  </span>
                  {b.avgRating !== null && (
                    <span className="flex shrink-0 items-center gap-1">
                      <StarRating rating={Math.round(b.avgRating)} size="sm" />
                      <span>({b.reviewCount})</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
