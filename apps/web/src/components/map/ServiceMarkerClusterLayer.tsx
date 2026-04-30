import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import { formatPrice } from '../../lib/format'

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

/**
 * Icon distinto para serviços (cor sage) — diferencia visualmente
 * dos markers azuis dos criadores.
 */
const serviceIcon = L.divIcon({
  className: 'patacerta-service-marker',
  html: `<div style="
    width:28px;height:28px;border-radius:50% 50% 50% 0;
    background:#5b8a72;border:2px solid #fff;
    transform:rotate(-45deg);
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
    display:flex;align-items:center;justify-content:center;
  "><span style="
    transform:rotate(45deg);color:#fff;font-size:14px;line-height:1;
  ">🐾</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
})

/**
 * Markers de serviços agrupados. Popup liga para /servicos/:id via SPA navigate.
 */
export function ServiceMarkerClusterLayer({ markers }: Props) {
  const map = useMap()
  const navigate = useNavigate()

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
    }) as L.LayerGroup

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { icon: serviceIcon })
      marker.bindPopup(
        `<div style="min-width:200px">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">${escapeHtml(m.categoryName)}</div>
          <div style="margin-top:2px;font-weight:600;font-size:14px;color:#111827">${escapeHtml(m.title)}</div>
          <div style="margin-top:6px;font-size:13px;font-weight:600;color:#111827">${formatPrice(m.priceCents, m.priceUnit)}</div>
          <a href="/servicos/${m.id}" data-spa-link="/servicos/${m.id}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:500;color:#A07548;text-decoration:none;cursor:pointer">Ver anúncio →</a>
        </div>`,
        { closeButton: true, autoPan: true },
      )
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
        const path = link.getAttribute('data-spa-link')
        if (path) navigate(path)
      })
    }
    map.on('popupopen', onPopupOpen)

    return () => {
      map.off('popupopen', onPopupOpen)
      map.removeLayer(cluster)
    }
  }, [map, markers, navigate])

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
