// ============================================
// PataCerta — Payments (Sponsored Slots) types
// ============================================
//
// Tipos partilhados entre o tab "Destaque" e o CTA do simulador.
// Os endpoints são chamados via `api.*` directamente (convenção do FE);
// estes tipos só descrevem o shape das respostas.

export type SponsoredSlotStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED'
export type SponsoredSlotPaymentStatus = 'LEGACY' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

export interface MySponsoredSlot {
  id: number
  breedId: number
  startsAt: string
  endsAt: string
  status: SponsoredSlotStatus
  paymentStatus: SponsoredSlotPaymentStatus
  priceCents: number | null
  currency: string | null
  paidAt: string | null
  stripeReceiptUrl: string | null
  impressionCount: number
  clickCount: number
  createdAt: string
  breed: { id: number; namePt: string; nameSlug: string }
}

export interface SponsoredSlotAvailability {
  breedId: number
  occupied: number
  maxSlots: number
  available: number
  priceCents: number
  currency: string
  durationDays: number
}

export interface CreateCheckoutResponse {
  sessionId: string
  url: string
  slotId: number
}
