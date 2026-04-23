import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import '../../lib/leaflet-setup'

interface MiniMapProps {
  latitude: number
  longitude: number
  label: string
  zoom?: number
}

/**
 * Small non-interactive-ish map for single-location display on breeder profile.
 * Allows pan/zoom but starts zoomed on the district centroid.
 */
export function MiniMap({ latitude, longitude, label, zoom = 10 }: MiniMapProps) {
  return (
    <div className="h-48 w-full overflow-hidden rounded-lg">
      <MapContainer
        center={[latitude, longitude]}
        zoom={zoom}
        minZoom={6}
        maxZoom={16}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]}>
          <Popup>{label}</Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}
