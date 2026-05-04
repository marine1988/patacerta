import { Router, raw } from 'express'
import { handleStripeWebhook } from './stripe-webhook.controller.js'

export const webhooksRouter = Router()

// IMPORTANTE: Stripe envia o body como JSON e queremos a sua representação
// raw (Buffer) para validar a assinatura. Usamos express.raw apenas neste
// endpoint — em index.ts este router é montado ANTES de express.json()
// para evitar que o middleware global consuma o body como JSON e quebre
// a verificação de assinatura.
//
// O endpoint não tem auth nem rate-limit — Stripe pode re-tentar muitas
// vezes em casos de falha, e a sua origem é validada pela assinatura.
webhooksRouter.post('/stripe', raw({ type: 'application/json', limit: '1mb' }), handleStripeWebhook)
