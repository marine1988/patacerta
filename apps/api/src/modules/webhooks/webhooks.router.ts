import { Router, raw } from 'express'
import { handleStripeWebhook } from './stripe-webhook.controller.js'
import { asyncHandler } from '../../lib/helpers.js'

export const webhooksRouter = Router()

// IMPORTANTE: Stripe envia o body como JSON e queremos a sua representação
// raw (Buffer) para validar a assinatura. Usamos express.raw apenas neste
// endpoint — em index.ts este router é montado ANTES de express.json()
// para evitar que o middleware global consuma o body como JSON e quebre
// a verificação de assinatura.
//
// O endpoint não tem auth nem rate-limit — Stripe pode re-tentar muitas
// vezes em casos de falha, e a sua origem é validada pela assinatura.
//
// asyncHandler é OBRIGATÓRIO: handleStripeWebhook é async; sem o wrapper
// uma promise rejeitada (e.g. timeout de DB) vira unhandled rejection
// e crasha o processo (Node 20 default).
webhooksRouter.post(
  '/stripe',
  raw({ type: 'application/json', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    await handleStripeWebhook(req, res)
  }),
)
