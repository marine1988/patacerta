// ============================================
// PataCerta — Stripe Webhook Controller Tests
// ============================================
//
// Testes unitários do handler de webhooks Stripe. Mockam-se prisma,
// stripe SDK e email para isolar a lógica de roteamento, idempotência
// e race conditions, sem tocar em DB nem rede.
//
// Cobertura:
//   - Sem secret configurado → 503
//   - Sem header de assinatura / inválida → 400
//   - Idempotência via P2002 do StripeEvent → 200 duplicate
//   - checkout.session.completed paid (cartão) → activa slot
//   - checkout.session.completed unpaid (Multibanco pendente) → no-op
//   - async_payment_succeeded → activa slot
//   - async_payment_failed em slot já PAID → não regride
//   - charge.refunded → marca refunded
//   - Evento não tratado → 200 sem efeito
//   - Falha de DB no dispatch → ainda 200 (best-effort)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import type Stripe from 'stripe'

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    stripeEvent: {
      create: vi.fn(),
    },
    sponsoredBreedSlot: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

const mockConstructEvent = vi.fn()
const mockPaymentIntentsRetrieve = vi.fn()

vi.mock('../../lib/stripe.js', () => ({
  isStripeConfigured: vi.fn(() => true),
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
  })),
  SPONSORED_SLOT_DURATION_DAYS: 30,
}))

vi.mock('../../lib/email.js', () => ({
  sendSponsoredSlotPaidEmail: vi.fn(),
}))

import { handleStripeWebhook } from './stripe-webhook.controller.js'
import { prisma } from '../../lib/prisma.js'
import { isStripeConfigured } from '../../lib/stripe.js'
import { sendSponsoredSlotPaidEmail } from '../../lib/email.js'

const mockedPrisma = prisma as unknown as {
  stripeEvent: { create: ReturnType<typeof vi.fn> }
  sponsoredBreedSlot: {
    findUnique: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}
const mockedIsStripeConfigured = isStripeConfigured as unknown as ReturnType<typeof vi.fn>
const mockedSendEmail = sendSponsoredSlotPaidEmail as unknown as ReturnType<typeof vi.fn>

// ─── Helpers ─────────────────────────────────────────────────────────

function makeReq(opts: { body?: Buffer; signature?: string | string[] | undefined }): Request {
  return {
    body: opts.body ?? Buffer.from('{}'),
    headers: opts.signature !== undefined ? { 'stripe-signature': opts.signature } : {},
  } as unknown as Request
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  }
}

function makeEvent<T extends Stripe.Event['data']['object']>(
  type: string,
  object: T,
  id = 'evt_test_123',
): Stripe.Event {
  return {
    id,
    type,
    api_version: '2026-04-22.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    object: 'event',
    data: { object },
  } as unknown as Stripe.Event
}

function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: 'pi_test_123',
    ...overrides,
  } as Stripe.Checkout.Session
}

// ─── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  mockedIsStripeConfigured.mockReturnValue(true)
})

describe('handleStripeWebhook — guards', () => {
  it('devolve 503 quando Stripe não está configurado', async () => {
    mockedIsStripeConfigured.mockReturnValue(false)
    const req = makeReq({ signature: 't=1,v1=abc' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'STRIPE_NOT_CONFIGURED' }),
    )
  })

  it('devolve 503 quando STRIPE_WEBHOOK_SECRET em falta', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const req = makeReq({ signature: 't=1,v1=abc' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WEBHOOK_NOT_CONFIGURED' }),
    )
  })

  it('devolve 400 quando o header stripe-signature está em falta', async () => {
    const req = makeReq({ signature: undefined })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Assinatura em falta' })
  })

  it('devolve 400 quando stripe-signature é array (header duplicado)', async () => {
    const req = makeReq({ signature: ['t=1,v1=a', 't=1,v1=b'] })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('devolve 400 quando a assinatura é inválida', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload.')
    })
    const req = makeReq({ signature: 't=1,v1=bad' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Assinatura inválida' })
    expect(mockedPrisma.stripeEvent.create).not.toHaveBeenCalled()
  })
})

describe('handleStripeWebhook — idempotência', () => {
  it('devolve 200 duplicate quando event.id já está em StripeEvent (P2002)', async () => {
    const event = makeEvent('checkout.session.completed', makeSession())
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockRejectedValue({ code: 'P2002' })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true })
    // Crucial: nenhum efeito de domínio é aplicado para retries.
    expect(mockedPrisma.sponsoredBreedSlot.findUnique).not.toHaveBeenCalled()
    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
  })

  it('devolve 500 quando StripeEvent.create falha por outro motivo (força retry)', async () => {
    const event = makeEvent('checkout.session.completed', makeSession())
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockRejectedValue(new Error('connection refused'))

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
  })
})

describe('handleStripeWebhook — checkout.session.completed', () => {
  it('paid (cartão) activa o slot e envia email', async () => {
    const session = makeSession({ payment_status: 'paid', payment_intent: 'pi_abc' })
    const event = makeEvent('checkout.session.completed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue({
      id: 42,
      paymentStatus: 'PENDING',
      priceCents: 1000,
      currency: 'EUR',
      breed: { id: 1, namePt: 'Labrador', nameSlug: 'labrador-retriever' },
      breeder: { id: 7, businessName: 'Canil Teste' },
      paidBy: { email: 'criador@example.com' },
    })
    mockedPrisma.sponsoredBreedSlot.updateMany.mockResolvedValue({ count: 1 })
    mockPaymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_abc',
      latest_charge: { receipt_url: 'https://stripe.test/receipt/abc' },
    })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 42 }),
        data: expect.objectContaining({
          paymentStatus: 'PAID',
          status: 'ACTIVE',
          stripePaymentIntentId: 'pi_abc',
          stripeReceiptUrl: 'https://stripe.test/receipt/abc',
        }),
      }),
    )
    expect(mockedSendEmail).toHaveBeenCalledWith(
      'criador@example.com',
      expect.objectContaining({
        breederName: 'Canil Teste',
        breedName: 'Labrador',
        receiptUrl: 'https://stripe.test/receipt/abc',
      }),
    )
  })

  it('unpaid (Multibanco pendente) não toca no slot', async () => {
    const session = makeSession({ payment_status: 'unpaid' })
    const event = makeEvent('checkout.session.completed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.findUnique).not.toHaveBeenCalled()
    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('paid mas slot não encontrado (session id desconhecida) — no-op silencioso', async () => {
    const session = makeSession({ payment_status: 'paid', id: 'cs_orphan' })
    const event = makeEvent('checkout.session.completed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue(null)

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('paid mas slot já PAID — no-op idempotente, não duplica email', async () => {
    const session = makeSession({ payment_status: 'paid' })
    const event = makeEvent('checkout.session.completed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue({
      id: 42,
      paymentStatus: 'PAID',
      priceCents: 1000,
      currency: 'EUR',
      breed: { id: 1, namePt: 'Labrador', nameSlug: 'labrador' },
      breeder: { id: 7, businessName: 'Canil Teste' },
      paidBy: { email: 'criador@example.com' },
    })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('falha a expandir PaymentIntent não bloqueia activação (receipt fica null)', async () => {
    const session = makeSession({ payment_status: 'paid', payment_intent: 'pi_abc' })
    const event = makeEvent('checkout.session.completed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue({
      id: 42,
      paymentStatus: 'PENDING',
      priceCents: 1000,
      currency: 'EUR',
      breed: { id: 1, namePt: 'Labrador', nameSlug: 'labrador' },
      breeder: { id: 7, businessName: 'Canil Teste' },
      paidBy: null,
    })
    mockedPrisma.sponsoredBreedSlot.updateMany.mockResolvedValue({ count: 1 })
    mockPaymentIntentsRetrieve.mockRejectedValue(new Error('stripe API timeout'))

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'PAID',
          stripePaymentIntentId: 'pi_abc',
          stripeReceiptUrl: null,
        }),
      }),
    )
    // Sem paidBy.email, não há tentativa de email.
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })
})

describe('handleStripeWebhook — async / failed / refunded', () => {
  it('async_payment_succeeded activa slot Multibanco', async () => {
    const session = makeSession({ payment_status: 'paid' })
    const event = makeEvent('checkout.session.async_payment_succeeded', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue({
      id: 99,
      paymentStatus: 'PENDING',
      priceCents: 1000,
      currency: 'EUR',
      breed: { id: 2, namePt: 'Beagle', nameSlug: 'beagle' },
      breeder: { id: 8, businessName: 'Canil Multibanco' },
      paidBy: { email: 'mb@example.com' },
    })
    mockedPrisma.sponsoredBreedSlot.updateMany.mockResolvedValue({ count: 1 })
    mockPaymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_test_123',
      latest_charge: { receipt_url: 'https://stripe.test/r/mb' },
    })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 99 }),
        data: expect.objectContaining({ paymentStatus: 'PAID', status: 'ACTIVE' }),
      }),
    )
  })

  it('async_payment_failed marca FAILED + status EXPIRED', async () => {
    const session = makeSession({ payment_status: 'unpaid' })
    const event = makeEvent('checkout.session.async_payment_failed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue({
      id: 50,
      paymentStatus: 'PENDING',
    })
    mockedPrisma.sponsoredBreedSlot.updateMany.mockResolvedValue({ count: 1 })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 50 }),
        data: expect.objectContaining({
          paymentStatus: 'FAILED',
          status: 'EXPIRED',
        }),
      }),
    )
  })

  it('async_payment_failed em slot já PAID — não regride (race protection)', async () => {
    const session = makeSession()
    const event = makeEvent('checkout.session.async_payment_failed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue({
      id: 50,
      paymentStatus: 'PAID',
    })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
  })

  it('checkout.session.expired marca FAILED', async () => {
    const session = makeSession({ payment_status: 'unpaid' })
    const event = makeEvent('checkout.session.expired', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockResolvedValue({
      id: 51,
      paymentStatus: 'PENDING',
    })
    mockedPrisma.sponsoredBreedSlot.updateMany.mockResolvedValue({ count: 1 })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(mockedPrisma.sponsoredBreedSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentStatus: 'FAILED' }),
      }),
    )
  })

  it('charge.refunded marca REFUNDED', async () => {
    const charge = {
      id: 'ch_test',
      object: 'charge',
      payment_intent: 'pi_test_123',
    } as unknown as Stripe.Charge
    const event = makeEvent('charge.refunded', charge)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findFirst.mockResolvedValue({
      id: 60,
      paymentStatus: 'PAID',
    })
    mockedPrisma.sponsoredBreedSlot.updateMany.mockResolvedValue({ count: 1 })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 60 }),
        data: expect.objectContaining({
          paymentStatus: 'REFUNDED',
          status: 'EXPIRED',
        }),
      }),
    )
  })

  it('charge.refunded em slot já REFUNDED — no-op', async () => {
    const charge = { payment_intent: 'pi_test_123' } as unknown as Stripe.Charge
    const event = makeEvent('charge.refunded', charge)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findFirst.mockResolvedValue({
      id: 60,
      paymentStatus: 'REFUNDED',
    })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
  })

  it('charge.refunded sem payment_intent string — no-op', async () => {
    const charge = { payment_intent: null } as unknown as Stripe.Charge
    const event = makeEvent('charge.refunded', charge)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockedPrisma.sponsoredBreedSlot.findFirst).not.toHaveBeenCalled()
  })
})

describe('handleStripeWebhook — robustez', () => {
  it('evento não tratado é registado mas devolve 200 sem efeito', async () => {
    const event = makeEvent('payment_intent.created', { id: 'pi_x' } as Stripe.PaymentIntent)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
    // Evento foi gravado para idempotência.
    expect(mockedPrisma.stripeEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: event.id, type: 'payment_intent.created' }),
      }),
    )
    expect(mockedPrisma.sponsoredBreedSlot.update).not.toHaveBeenCalled()
  })

  it('falha de DB no dispatch é absorvida — devolve 200 (best-effort)', async () => {
    const session = makeSession({ payment_status: 'paid' })
    const event = makeEvent('checkout.session.completed', session)
    mockConstructEvent.mockReturnValue(event)
    mockedPrisma.stripeEvent.create.mockResolvedValue({ id: event.id })
    mockedPrisma.sponsoredBreedSlot.findUnique.mockRejectedValue(new Error('DB down'))

    const req = makeReq({ signature: 't=1,v1=ok' })
    const res = makeRes()

    await handleStripeWebhook(req, res)

    // 200 mesmo com erro: evento já registado, retry não ajuda.
    // Admin reprocessa via StripeEvent.payload guardado.
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })
})
