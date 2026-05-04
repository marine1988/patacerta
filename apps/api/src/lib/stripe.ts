import Stripe from 'stripe'

/**
 * Cliente Stripe singleton. Lazy: só instancia na primeira chamada
 * para que builds sem STRIPE_SECRET_KEY (e.g. CI sem secrets) não
 * crashem a importação de módulos que dependem de Stripe.
 *
 * Em runtime, módulos que façam pagamentos devem chamar `getStripe()`.
 * Se a chave não estiver configurada, lança um erro claro.
 *
 * `apiVersion` está fixada para garantir comportamento estável entre
 * deploys. Ao actualizar, testar webhooks e Checkout Sessions.
 */
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY não definida. Configure em .env ou nas variáveis de ambiente do deploy.',
    )
  }
  _stripe = new Stripe(key, {
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
    appInfo: {
      name: 'PataCerta',
      version: '0.1.0',
    },
  })
  return _stripe
}

/**
 * `true` se há configuração suficiente para aceitar pagamentos.
 * Útil para guards no boot ou flags que escondem UI de checkout.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * Preço fixo do MVP: 10€ por 30 dias por slot patrocinado.
 * No futuro, mover para tabela `Plan`/`SlotPrice` editável pelo admin.
 */
export const SPONSORED_SLOT_PRICE_CENTS = 1000
export const SPONSORED_SLOT_DURATION_DAYS = 30
export const SPONSORED_SLOT_CURRENCY = 'eur'
