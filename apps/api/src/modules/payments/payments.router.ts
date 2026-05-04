import { Router } from 'express'
import { requireAuth, requireBreederProfile } from '../../middleware/auth.js'
import { rateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './payments.controller.js'

export const paymentsRouter = Router()

// Limita criações de Checkout Session por utilizador autenticado.
// 10 sessões / hora cobre fluxo legítimo (criador testa cartão, falha,
// repete) e bloqueia automação maliciosa que crie centenas de slots
// PENDING que ocupem vagas até expirarem.
const checkoutRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiadas tentativas de pagamento. Aguarde uma hora.',
  bucket: 'payments-checkout',
  keyGenerator: (req) => {
    const userId = req.user?.userId
    return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`
  },
})

// GET /api/payments/sponsored-slot/availability?breedId=N
// Público (necessário para FE saber se botão "Comprar destaque" deve
// aparecer mesmo antes de login). Sem auth.
paymentsRouter.get('/sponsored-slot/availability', ctrl.getSponsoredSlotAvailability)

// POST /api/payments/sponsored-slot/checkout
// Requer auth + perfil de criador VERIFIED (validação extra no controller).
paymentsRouter.post(
  '/sponsored-slot/checkout',
  requireAuth,
  requireBreederProfile,
  checkoutRateLimit,
  ctrl.createSponsoredSlotCheckout,
)

// GET /api/payments/sponsored-slot/mine
// Histórico de slots do criador autenticado.
paymentsRouter.get(
  '/sponsored-slot/mine',
  requireAuth,
  requireBreederProfile,
  ctrl.listMySponsoredSlots,
)
