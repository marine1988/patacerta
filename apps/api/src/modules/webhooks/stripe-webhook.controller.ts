// ============================================
// PataCerta — Stripe Webhooks Controller
// ============================================
//
// Recebe eventos Stripe e converte-os em mutações de domínio
// (activar slot pago, marcar falhado, etc).
//
// CRÍTICO: este endpoint precisa do raw body original para validar
// a assinatura. Por isso é montado em index.ts ANTES do
// `express.json()`, com `express.raw({ type: 'application/json' })`.
//
// Idempotência: cada Stripe `event.id` é registado em `StripeEvent`
// na primeira recepção. Re-tentativas (Stripe re-tenta até ~3 dias se
// devolvermos 5xx) são detectadas e respondidas 200 sem efeito.
//
// Sempre devolvemos 200 quando o evento foi RECEBIDO com sucesso, mesmo
// que o seu processamento de domínio tenha falhado (logamos e seguimos)
// — assim evitamos loops infinitos de retry para problemas transitórios
// de DB. Falhas REAIS (assinatura inválida) devolvem 400.

import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import { prisma } from '../../lib/prisma.js'
import { getStripe, isStripeConfigured } from '../../lib/stripe.js'
import { sendSponsoredSlotPaidEmail } from '../../lib/email.js'
import { SPONSORED_SLOT_DURATION_DAYS } from '../../lib/stripe.js'

/**
 * Eventos Stripe que tratamos:
 *   checkout.session.completed         — pagamento síncrono OK (cartão)
 *                                         OU Multibanco com referência
 *                                         emitida (NÃO pago ainda).
 *   checkout.session.async_payment_succeeded — Multibanco confirmado.
 *   checkout.session.async_payment_failed    — Multibanco expirou.
 *   checkout.session.expired           — sessão expirou sem pagamento.
 *   charge.refunded                    — reembolso (manual via dashboard).
 */
const HANDLED_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
])

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Stripe não configurado', code: 'STRIPE_NOT_CONFIGURED' })
    return
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET em falta — webhook desactivado')
    res.status(503).json({ error: 'Webhook não configurado', code: 'WEBHOOK_NOT_CONFIGURED' })
    return
  }

  const signature = req.headers['stripe-signature']
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'Assinatura em falta' })
    return
  }

  // req.body aqui é um Buffer (montado com express.raw em index.ts).
  // constructEvent rejeita se a assinatura não bater certo.
  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn(`[Stripe Webhook] Assinatura inválida: ${msg}`)
    res.status(400).json({ error: 'Assinatura inválida' })
    return
  }

  // Idempotência: gravar o event.id antes de processar. Se já existe,
  // é um retry — devolvemos 200 sem repetir efeitos.
  try {
    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
        payload: event as unknown as object, // Prisma Json — Stripe.Event é JSON-safe.
      },
    })
  } catch (err) {
    // P2002 = unique constraint. Já processado.
    const code = (err as { code?: string }).code
    if (code === 'P2002') {
      console.log(`[Stripe Webhook] Evento ${event.id} já processado, ignorando.`)
      res.status(200).json({ received: true, duplicate: true })
      return
    }
    console.error(`[Stripe Webhook] Erro a registar evento ${event.id}:`, err)
    // Se não conseguimos registar idempotência, devolvemos 500 para
    // forçar Stripe a re-tentar (preferível a processar duas vezes).
    res.status(500).json({ error: 'Falha a registar evento' })
    return
  }

  // Processamento de domínio. Erros aqui são logados mas devolvemos
  // 200 — o evento está registado e re-tentar não muda nada (a falha
  // tipicamente é de DB transiente; admin pode reprocessar manualmente
  // a partir do StripeEvent.payload guardado).
  if (HANDLED_EVENT_TYPES.has(event.type)) {
    try {
      await dispatchEvent(event)
    } catch (err) {
      console.error(`[Stripe Webhook] Falha ao processar ${event.type} ${event.id}:`, err)
    }
  } else {
    console.log(`[Stripe Webhook] Evento ${event.type} recebido mas não tratado.`)
  }

  res.status(200).json({ received: true })
}

async function dispatchEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      // Para cartão, payment_status é 'paid' aqui mesmo. Para
      // Multibanco, payment_status='unpaid' até async_payment_succeeded.
      if (session.payment_status === 'paid') {
        await markSlotPaid(session)
      } else {
        console.log(
          `[Stripe Webhook] checkout.session.completed unpaid (provavelmente Multibanco pendente) session=${session.id}`,
        )
      }
      return
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session
      await markSlotPaid(session)
      return
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      await markSlotFailed(session.id, event.type)
      return
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      await markSlotRefunded(charge)
      return
    }
  }
}

/**
 * Activa o slot: paymentStatus=PAID, status=ACTIVE, datas re-escritas
 * para now/now+30d (estavam placeholders na criação) e regista
 * payment_intent + receipt_url.
 *
 * Idempotente: se já está PAID, no-op.
 */
async function markSlotPaid(session: Stripe.Checkout.Session): Promise<void> {
  const slot = await prisma.sponsoredBreedSlot.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    include: {
      breed: { select: { id: true, namePt: true, nameSlug: true } },
      breeder: { select: { id: true, businessName: true } },
      paidBy: { select: { email: true } },
    },
  })
  if (!slot) {
    console.warn(`[Stripe Webhook] Slot não encontrado para session ${session.id}`)
    return
  }
  if (slot.paymentStatus === 'PAID') {
    console.log(`[Stripe Webhook] Slot ${slot.id} já estava PAID, no-op.`)
    return
  }

  // Buscar receipt_url do PaymentIntent / Charge para guardar.
  let paymentIntentId: string | null = null
  let receiptUrl: string | null = null
  if (typeof session.payment_intent === 'string') {
    paymentIntentId = session.payment_intent
    try {
      const stripe = getStripe()
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      })
      const charge = pi.latest_charge as Stripe.Charge | null
      receiptUrl = charge?.receipt_url ?? null
    } catch (err) {
      console.warn(`[Stripe Webhook] Falha a expandir PaymentIntent ${paymentIntentId}:`, err)
    }
  }

  const now = new Date()
  const endsAt = new Date(now.getTime() + SPONSORED_SLOT_DURATION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.sponsoredBreedSlot.update({
    where: { id: slot.id },
    data: {
      paymentStatus: 'PAID',
      status: 'ACTIVE',
      startsAt: now,
      endsAt,
      paidAt: now,
      stripePaymentIntentId: paymentIntentId,
      stripeReceiptUrl: receiptUrl,
    },
  })

  console.log(
    `[Stripe Webhook] Slot ${slot.id} activado (${slot.breeder.businessName} -> ${slot.breed.namePt}) até ${endsAt.toISOString()}`,
  )

  // Email de confirmação (best-effort).
  const recipientEmail = slot.paidBy?.email
  if (recipientEmail) {
    try {
      await sendSponsoredSlotPaidEmail(recipientEmail, {
        breederName: slot.breeder.businessName,
        breedName: slot.breed.namePt,
        breedSlug: slot.breed.nameSlug,
        endsAt,
        priceCents: slot.priceCents ?? 0,
        currency: slot.currency ?? 'EUR',
        receiptUrl,
      })
    } catch (err) {
      console.error(
        `[Stripe Webhook] Falha a enviar email confirmação para ${recipientEmail}:`,
        err,
      )
    }
  }
}

async function markSlotFailed(sessionId: string, reason: string): Promise<void> {
  const slot = await prisma.sponsoredBreedSlot.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true, paymentStatus: true },
  })
  if (!slot) return
  // Não regredir um slot já PAID (event order race).
  if (slot.paymentStatus === 'PAID') return

  await prisma.sponsoredBreedSlot.update({
    where: { id: slot.id },
    data: {
      paymentStatus: 'FAILED',
      status: 'EXPIRED',
      notes: `Pagamento falhou (${reason})`.slice(0, 500),
    },
  })
  console.log(`[Stripe Webhook] Slot ${slot.id} marcado FAILED por ${reason}`)
}

async function markSlotRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
  if (!paymentIntentId) return

  const slot = await prisma.sponsoredBreedSlot.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, paymentStatus: true },
  })
  if (!slot) return
  if (slot.paymentStatus === 'REFUNDED') return

  await prisma.sponsoredBreedSlot.update({
    where: { id: slot.id },
    data: {
      paymentStatus: 'REFUNDED',
      status: 'EXPIRED',
      notes: 'Reembolsado via Stripe'.slice(0, 500),
    },
  })
  console.log(`[Stripe Webhook] Slot ${slot.id} marcado REFUNDED`)
}
