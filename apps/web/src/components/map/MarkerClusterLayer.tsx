import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'

export interface MapMarker {
  id: number
  /** Slug canónico do criador. Quando ausente, o link cai para o id (nginx redirecciona). */
  slug?: string | null
  lat: number
  lng: number
  businessName: string
  districtName: string
  municipalityName: string
  avgRating: number | null
  reviewCount: number
  /** @deprecated MVP só-cães: não é renderizado mas mantido para compatibilidade. */
  speciesLabels: string[]
}

interface MarkerClusterProps {
  markers: MapMarker[]
  onMarkerClick?: (marker: MapMarker) => void
}

/**
 * Renders markers via leaflet.markercluster (no react-leaflet binding).
 * We manage the cluster group imperatively inside the existing MapContainer.
 *
 * O link "Ver perfil" no popup é interceptado e navegado via SPA
 * (react-router) para preservar o estado da página e evitar full reload.
 */
export function MarkerClusterLayer({ markers, onMarkerClick }: MarkerClusterProps) {
  const map = useMap()
  const navigate = useNavigate()

  useEffect(() => {
    // markerClusterGroup is augmented onto L by the leaflet.markercluster plugin
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
    }) as L.LayerGroup

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng])
      const rating =
        m.avgRating !== null
          ? `<div style="margin-top:4px;font-size:12px;color:#6b7280">★ ${m.avgRating.toFixed(1)} (${m.reviewCount} avaliações)</div>`
          : `<div style="margin-top:4px;font-size:12px;color:#9ca3af">Sem avaliações</div>`
      const path = `/criador/${m.slug ?? m.id}`
      marker.bindPopup(
        `<div style="min-width:200px">
          <div style="font-weight:600;font-size:14px;color:#111827">${escapeHtml(m.businessName)}</div>
          <div style="margin-top:2px;font-size:12px;color:#6b7280">${escapeHtml(m.municipalityName)}, ${escapeHtml(m.districtName)}</div>
          ${rating}
          <a href="${path}" data-spa-link="${path}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:500;color:#A07548;text-decoration:none;cursor:pointer">Ver perfil →</a>
        </div>`,
        { closeButton: true, autoPan: true },
      )
      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(m))
      }
      cluster.addLayer(marker)
    })

    map.addLayer(cluster)

    // Intercepta cliques nos links dos popups e navega via SPA.
    function onPopupOpen(e: L.LeafletEvent) {
      const popup = (e as L.PopupEvent).popup
      const el = popup.getElement()
      if (!el) return
      const link = el.querySelector<HTMLAnchorElement>('a[data-spa-link]')
      if (!link) return
      link.addEventListener('click', (ev) => {
        ev.preventDefault()
        const target = link.getAttribute('data-spa-link')
        if (target) navigate(target)
      })
    }
    map.on('popupopen', onPopupOpen)

    return () => {
      map.off('popupopen', onPopupOpen)
      map.removeLayer(cluster)
    }
  }, [map, markers, onMarkerClick, navigate])

  return null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
