import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'

export interface MapMarker {
  id: number
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
 */
export function MarkerClusterLayer({ markers, onMarkerClick }: MarkerClusterProps) {
  const map = useMap()

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
      marker.bindPopup(
        `<div style="min-width:200px">
          <div style="font-weight:600;font-size:14px;color:#111827">${escapeHtml(m.businessName)}</div>
          <div style="margin-top:2px;font-size:12px;color:#6b7280">${escapeHtml(m.municipalityName)}, ${escapeHtml(m.districtName)}</div>
          ${rating}
          <a href="/criador/${m.id}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:500;color:#2563eb;text-decoration:none">Ver perfil →</a>
        </div>`,
        { closeButton: true, autoPan: true },
      )
      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(m))
      }
      cluster.addLayer(marker)
    })

    map.addLayer(cluster)
    return () => {
      map.removeLayer(cluster)
    }
  }, [map, markers, onMarkerClick])

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
