import { useCallback, useState } from 'react'

export interface Coords {
  lat: number
  lng: number
  /** Precisao em metros, conforme reportada pelo browser. */
  accuracy: number
}

export interface UseGeolocationResult {
  coords: Coords | null
  loading: boolean
  /** Mensagem amigavel pt-PT, pronta para mostrar ao utilizador. */
  error: string | null
  /** Pede permissao e tenta obter localizacao. Idempotente. */
  request: () => void
  /** Limpa estado (ex: utilizador remove o filtro). */
  clear: () => void
}

/**
 * Hook minimo para `navigator.geolocation`.
 *
 * - Pede permissao on-demand (so' ao chamar `request()`).
 * - Nao guarda nada em localStorage; conforme RGPD, a posicao e' so'
 *   usada em memoria para o filtro actual.
 * - Erros mapeados para mensagens claras em pt-PT.
 * - Timeout de 10s para evitar UIs presas em "A localizar...".
 */
export function useGeolocation(): UseGeolocationResult {
  const [coords, setCoords] = useState<Coords | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('O seu browser não suporta geolocalização.')
      return
    }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setLoading(false)
      },
      (err) => {
        setLoading(false)
        if (err.code === err.PERMISSION_DENIED) {
          setError('Permissão de localização recusada.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Não foi possível determinar a sua localização.')
        } else if (err.code === err.TIMEOUT) {
          setError('Demorou demasiado a obter a localização.')
        } else {
          setError('Erro ao obter localização.')
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  const clear = useCallback(() => {
    setCoords(null)
    setError(null)
    setLoading(false)
  }, [])

  return { coords, loading, error, request, clear }
}
