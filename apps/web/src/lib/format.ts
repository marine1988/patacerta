// ============================================
// PataCerta — Formatação partilhada
// ============================================
//
// Helpers de formatação de preço (EUR pt-PT) usados em vários
// pontos do diretório, mapa e dashboard.

export type ServicePriceUnit = 'FIXED' | 'HOURLY' | 'PER_SESSION'

/** Sufixo a anexar ao valor consoante a unidade de preço. */
export const priceUnitSuffix: Record<ServicePriceUnit, string> = {
  FIXED: '',
  HOURLY: '/ hora',
  PER_SESSION: '/ sessão',
}

/**
 * Formata um valor em cêntimos como preço em EUR pt-PT, com sufixo
 * de unidade quando aplicável (ex.: "12,50€ / hora").
 */
export function formatPrice(cents: number, unit: ServicePriceUnit): string {
  const value = (cents / 100).toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const suffix = priceUnitSuffix[unit]
  return suffix ? `${value}€ ${suffix}` : `${value}€`
}

/**
 * Converte uma string introduzida pelo utilizador (ex.: "12,50" ou "12.5")
 * em cêntimos. Devolve `null` se o valor for inválido ou não positivo.
 */
export function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}
