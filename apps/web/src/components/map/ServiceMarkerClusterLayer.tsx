import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'

export interface ServiceMapMarker {
  id: number
  lat: number
  lng: number
  title: string
  categoryName: string
  priceCents: number
  priceUnit: 'FIXED' | 'HOURLY' | 'PER_SESSION'
}

interface Props {
  markers: ServiceMapMarker[]
}

const priceUnitSuffix: Record<ServiceMapMarker['priceUnit'], string> = {
  FIXED: '',
  HOURLY: '/ hora',
  PER_SESSION: '/ sessão',
}

function formatPrice(cents: number, unit: ServiceMapMarker['priceUnit']): string {
  const value = (cents / 100).toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const suffix = priceUnitSuffix[unit]
  return suffix ? `${value}€ ${suffix}` : `${value}€`
}

/**
 * Markers de serviços agrupados. Popup liga para /servicos/:id.
 */
export function ServiceMarkerClusterLayer({ markers }: Props) {
  const map = useMap()

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
    }) as L.LayerGroup

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng])
      marker.bindPopup(
        `<div style="min-width:200px">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">${escapeHtml(m.categoryName)}</div>
          <div style="margin-top:2px;font-weight:600;font-size:14px;color:#111827">${escapeHtml(m.title)}</div>
          <div style="margin-top:6px;font-size:13px;font-weight:600;color:#111827">${formatPrice(m.priceCents, m.priceUnit)}</div>
          <a href="/servicos/${m.id}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:500;color:#2563eb;text-decoration:none">Ver anúncio →</a>
        </div>`,
        { closeButton: true, autoPan: true },
      )
      cluster.addLayer(marker)
    })

    map.addLayer(cluster)
    return () => {
      map.removeLayer(cluster)
    }
  }, [map, markers])

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
