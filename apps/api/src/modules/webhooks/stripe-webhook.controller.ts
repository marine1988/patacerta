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
import { maskEmail } from '../../lib/redact.js'
import { logAudit } from '../../lib/audit.js'
import {
  SPONSORED_SLOT_DURATION_DAYS,
  SPONSORED_SLOT_PRICE_CENTS,
  SPONSORED_SLOT_CURRENCY,
} from '../../lib/stripe.js'

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

  // Processamento de domínio. Em caso de falha, fazemos rollback do
  // registo de idempotencia (delete do stripeEvent) e devolvemos 500
  // para que o Stripe retente. Sem este rollback, falhas transientes
  // de DB no dispatch deixariam o evento marcado como "processado"
  // mas com efeito de dominio incompleto (e.g. slot pago mas
  // permanentemente em PENDING). Email/Stripe-retrieve sao mantidos
  // FORA da transacao para nao prender ligacoes durante I/O de rede.
  if (HANDLED_EVENT_TYPES.has(event.type)) {
    try {
      await dispatchEvent(event)
    } catch (err) {
      console.error(`[Stripe Webhook] Falha ao processar ${event.type} ${event.id}:`, err)
      // Best-effort rollback do registo de idempotencia. Se isto
      // tambem falhar, logamos mas devolvemos 500 — o admin pode
      // sempre limpar manualmente a row e reprocessar.
      try {
        await prisma.stripeEvent.delete({ where: { id: event.id } })
      } catch (delErr) {
        console.error(
          `[Stripe Webhook] CRÍTICO: falha a fazer rollback do StripeEvent ${event.id} apos dispatch falhado. Necessaria limpeza manual:`,
          delErr,
        )
      }
      res.status(500).json({ error: 'Falha a processar evento', code: 'WEBHOOK_DISPATCH_FAILED' })
      return
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
  // Lookup com fallback por metadata.slotId. O webhook pode chegar antes
  // do controller persistir stripeCheckoutSessionId no slot (race entre
  // sessions.create devolver e o UPDATE imediatamente a seguir — Stripe
  // dispara `checkout.session.completed` para cartoes em segundos). Sem
  // fallback, a query por sessionId devolve null e o slot fica
  // permanentemente PENDING. Com fallback por metadata patcheamos o
  // sessionId em falta e activamos.
  let slot = await prisma.sponsoredBreedSlot.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    include: {
      breed: { select: { id: true, namePt: true, nameSlug: true } },
      breeder: { select: { id: true, businessName: true, status: true } },
      paidBy: { select: { email: true } },
    },
  })

  if (!slot) {
    const slotIdMeta = session.metadata?.slotId
    const slotIdParsed = slotIdMeta ? Number.parseInt(slotIdMeta, 10) : NaN
    if (Number.isFinite(slotIdParsed) && slotIdParsed > 0) {
      slot = await prisma.sponsoredBreedSlot.findUnique({
        where: { id: slotIdParsed },
        include: {
          breed: { select: { id: true, namePt: true, nameSlug: true } },
          breeder: { select: { id: true, businessName: true, status: true } },
          paidBy: { select: { email: true } },
        },
      })
      if (slot) {
        // Patch do sessionId em falta — race do controller. Best-effort,
        // idempotente: se outro webhook ja patcheou nao ha problema.
        if (!slot.stripeCheckoutSessionId) {
          await prisma.sponsoredBreedSlot
            .update({
              where: { id: slot.id },
              data: { stripeCheckoutSessionId: session.id },
            })
            .catch((err) => {
              console.warn(
                `[Stripe Webhook] Falha a patch stripeCheckoutSessionId no slot ${slot!.id}:`,
                err,
              )
            })
        }
      }
    }
  }

  if (!slot) {
    console.warn(
      `[Stripe Webhook] Slot nao encontrado para session ${session.id} (metadata.slotId=${session.metadata?.slotId ?? 'n/a'}). Lancando para forcar retry.`,
    )
    // Lancar (em vez de return) faz o dispatch falhar -> rollback do
    // StripeEvent -> Stripe retenta. Stripe retenta automaticamente em
    // 5xx ate ~3 dias, dando tempo para reconciliacao manual.
    throw new Error(`Slot nao encontrado para session ${session.id}`)
  }
  if (slot.paymentStatus === 'PAID') {
    console.log(`[Stripe Webhook] Slot ${slot.id} já estava PAID, no-op.`)
    return
  }

  // Validacao defesa-em-profundidade do montante e moeda recebidos.
  // Se a Stripe enviar um amount_total diferente do esperado (Price
  // mal configurado, Stripe API change, manipulacao da Checkout
  // Session), NAO activamos. Marcar FAILED com nota explicita e
  // logAudit de alta-severidade para revisao manual + eventual
  // reembolso. Stripe NAO faz refund automatico — fica para o admin.
  const expectedAmount = slot.priceCents ?? SPONSORED_SLOT_PRICE_CENTS
  const expectedCurrency = (slot.currency ?? SPONSORED_SLOT_CURRENCY).toUpperCase()
  const actualAmount = session.amount_total
  const actualCurrency = (session.currency ?? '').toUpperCase()
  if (actualAmount !== expectedAmount || actualCurrency !== expectedCurrency) {
    console.error(
      `[Stripe Webhook] CRITICO: amount/currency mismatch no slot ${slot.id}. esperado=${expectedAmount} ${expectedCurrency} recebido=${actualAmount} ${actualCurrency}`,
    )
    await prisma.sponsoredBreedSlot
      .updateMany({
        where: { id: slot.id, paymentStatus: { not: 'PAID' } },
        data: {
          paymentStatus: 'FAILED',
          status: 'EXPIRED',
          notes:
            `amount/currency mismatch: esperado ${expectedAmount} ${expectedCurrency} recebido ${actualAmount} ${actualCurrency}`.slice(
              0,
              500,
            ),
        },
      })
      .catch((err) => {
        console.error(`[Stripe Webhook] Falha a marcar slot ${slot!.id} FAILED por mismatch:`, err)
      })
    await logAudit({
      userId: slot.paidByUserId,
      action: 'sponsored_slot.payment_mismatch',
      entity: 'sponsored_slot',
      entityId: slot.id,
      details: `esperado=${expectedAmount} ${expectedCurrency} recebido=${actualAmount} ${actualCurrency} session=${session.id}`,
    })
    return
  }

  // Re-check do estado do criador. Para Multibanco o pagamento pode
  // confirmar dias depois — se entretanto o criador foi suspenso ou
  // perdeu verificacao, NAO devemos activar (apareceria pago no
  // historico mas nunca seria mostrado, sem refund automatico).
  if (slot.breeder.status !== 'VERIFIED') {
    console.warn(
      `[Stripe Webhook] Slot ${slot.id}: breeder ${slot.breeder.id} ja nao esta VERIFIED (${slot.breeder.status}). Pagamento marcado PAID mas slot fica PAUSED para revisao.`,
    )
    const now = new Date()
    const endsAt = new Date(now.getTime() + SPONSORED_SLOT_DURATION_DAYS * 24 * 60 * 60 * 1000)
    const result = await prisma.sponsoredBreedSlot.updateMany({
      where: { id: slot.id, paymentStatus: { not: 'PAID' } },
      data: {
        paymentStatus: 'PAID',
        // Fica PAUSED — admin tem de reactivar manualmente apos
        // resolver o estado do criador (re-verificacao ou refund).
        status: 'PAUSED',
        startsAt: now,
        endsAt,
        paidAt: now,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
        notes: `Pago mas breeder ${slot.breeder.status} a aguardar revisao admin`.slice(0, 500),
      },
    })
    if (result.count > 0) {
      await logAudit({
        userId: slot.paidByUserId,
        action: 'sponsored_slot.paid_pending_review',
        entity: 'sponsored_slot',
        entityId: slot.id,
        details: `breederId=${slot.breeder.id} status=${slot.breeder.status} requer revisao admin`,
      })
    }
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

  // updateMany condicional para evitar TOCTOU entre dois webhooks
  // concorrentes (`checkout.session.completed` + `async_payment_succeeded`):
  // ambos podem passar o check `paymentStatus !== 'PAID'` acima e acabariam
  // a activar o slot duas vezes (e a disparar dois emails). Aqui só a
  // primeira escrita devolve count=1; a segunda devolve 0 e fazemos no-op.
  const result = await prisma.sponsoredBreedSlot.updateMany({
    where: { id: slot.id, paymentStatus: { not: 'PAID' } },
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

  if (result.count === 0) {
    console.log(`[Stripe Webhook] Slot ${slot.id} ja activado por outro evento, no-op.`)
    return
  }

  console.log(
    `[Stripe Webhook] Slot ${slot.id} activado (${slot.breeder.businessName} -> ${slot.breed.namePt}) até ${endsAt.toISOString()}`,
  )

  // Audit do pagamento confirmado.
  await logAudit({
    userId: slot.paidByUserId,
    action: 'sponsored_slot.paid',
    entity: 'sponsored_slot',
    entityId: slot.id,
    details: `breederId=${slot.breeder.id} breedId=${slot.breed.id} priceCents=${expectedAmount} ${expectedCurrency} paymentIntent=${paymentIntentId ?? 'n/a'}`,
  })

  // Email de confirmação (best-effort). Email mascarado em logs para
  // nao vazar PII em ficheiros de log persistidos.
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
        `[Stripe Webhook] Falha a enviar email confirmação para ${maskEmail(recipientEmail)}:`,
        err,
      )
      await logAudit({
        userId: slot.paidByUserId,
        action: 'sponsored_slot.email_send_failed',
        entity: 'sponsored_slot',
        entityId: slot.id,
        details: 'Falha a enviar email de confirmacao apos PAID',
      })
    }
  }
}

async function markSlotFailed(sessionId: string, reason: string): Promise<void> {
  const slot = await prisma.sponsoredBreedSlot.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true, paidByUserId: true, breederId: true },
  })
  if (!slot) return

  // updateMany condicional: nao regredir um slot ja PAID (event order race
  // entre `checkout.session.async_payment_failed` e
  // `checkout.session.async_payment_succeeded`).
  const result = await prisma.sponsoredBreedSlot.updateMany({
    where: { id: slot.id, paymentStatus: { notIn: ['PAID', 'REFUNDED'] } },
    data: {
      paymentStatus: 'FAILED',
      status: 'EXPIRED',
      notes: `Pagamento falhou (${reason})`.slice(0, 500),
    },
  })
  if (result.count === 0) {
    console.log(`[Stripe Webhook] Slot ${slot.id} ja em estado terminal, no-op para FAILED.`)
    return
  }
  console.log(`[Stripe Webhook] Slot ${slot.id} marcado FAILED por ${reason}`)
  await logAudit({
    userId: slot.paidByUserId,
    action: 'sponsored_slot.payment_failed',
    entity: 'sponsored_slot',
    entityId: slot.id,
    details: `breederId=${slot.breederId} reason=${reason}`,
  })
}

async function markSlotRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
  if (!paymentIntentId) return

  const slot = await prisma.sponsoredBreedSlot.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, paidByUserId: true, breederId: true },
  })
  if (!slot) return

  // updateMany condicional para idempotencia entre `charge.refunded` events.
  const result = await prisma.sponsoredBreedSlot.updateMany({
    where: { id: slot.id, paymentStatus: { not: 'REFUNDED' } },
    data: {
      paymentStatus: 'REFUNDED',
      status: 'EXPIRED',
      notes: 'Reembolsado via Stripe'.slice(0, 500),
    },
  })
  if (result.count === 0) {
    console.log(`[Stripe Webhook] Slot ${slot.id} ja REFUNDED, no-op.`)
    return
  }
  console.log(`[Stripe Webhook] Slot ${slot.id} marcado REFUNDED`)
  await logAudit({
    userId: slot.paidByUserId,
    action: 'sponsored_slot.refunded',
    entity: 'sponsored_slot',
    entityId: slot.id,
    details: `breederId=${slot.breederId} paymentIntent=${paymentIntentId}`,
  })
}
