// ============================================
// PataCerta — Payments Controller Tests
// ============================================
//
// Testes unitários do controller de checkout de Sponsored Slots.
// Mocka prisma e Stripe SDK para isolar a lógica de validação,
// limite de 3 slots/raça, prevenção de duplicação, criação de slot
// PENDING e parâmetros da Checkout Session.
//
// Convenção: asyncHandler propaga erros via next(err); nos testes
// inspeccionamos `next.mock.calls[0][0]` para ver o AppError.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../lib/prisma.js', () => {
  const prismaMock: Record<string, unknown> = {
    breeder: {
      findUnique: vi.fn(),
    },
    breed: {
      findUnique: vi.fn(),
    },
    sponsoredBreedSlot: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  }
  // $transaction(callback) invoca o callback com o proprio prisma mock
  // como TransactionClient — os mesmos vi.fn() registam ambas as chamadas
  // (dentro/fora de transaccao), o que e' o que os testes assumem.
  prismaMock.$transaction = vi.fn(
    async (cb: (tx: unknown) => Promise<unknown>, _opts?: unknown) => cb(prismaMock),
  )
  return { prisma: prismaMock }
})

const mockSessionsCreate = vi.fn()

vi.mock('../../lib/stripe.js', () => ({
  isStripeConfigured: vi.fn(() => true),
  getStripe: vi.fn(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
  })),
  SPONSORED_SLOT_PRICE_CENTS: 1000,
  SPONSORED_SLOT_DURATION_DAYS: 30,
  SPONSORED_SLOT_CURRENCY: 'eur',
}))

import {
  createSponsoredSlotCheckout,
  getSponsoredSlotAvailability,
  listMySponsoredSlots,
} from './payments.controller.js'
import { prisma } from '../../lib/prisma.js'
import { isStripeConfigured } from '../../lib/stripe.js'
import { AppError } from '../../middleware/error-handler.js'

const mockedPrisma = prisma as unknown as {
  breeder: { findUnique: ReturnType<typeof vi.fn> }
  breed: { findUnique: ReturnType<typeof vi.fn> }
  sponsoredBreedSlot: {
    count: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}
const mockedIsStripeConfigured = isStripeConfigured as unknown as ReturnType<typeof vi.fn>

// ─── Helpers ─────────────────────────────────────────────────────────

interface ReqOpts {
  body?: unknown
  query?: Record<string, unknown>
  userId?: number
  email?: string
}

function makeReq(opts: ReqOpts = {}): Request {
  return {
    body: opts.body,
    query: opts.query ?? {},
    user: {
      userId: opts.userId ?? 7,
      email: opts.email ?? 'criador@example.com',
      role: 'BREEDER',
    },
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

function makeNext(): NextFunction & { mock: { calls: unknown[][] } } {
  return vi.fn() as unknown as NextFunction & { mock: { calls: unknown[][] } }
}

/**
 * Invoca o handler exportado (já envolvido em asyncHandler) e espera
 * pela cadeia de promessas. asyncHandler captura throws e chama next.
 *
 * Como asyncHandler é fire-and-forget (`fn(...).catch(next)`), não
 * temos handle directo da promessa interna. Drenamos microtasks até
 * que `res.json` ou `next` tenham sido chamados (o controller ou
 * acaba com sucesso ou propaga erro). Limite alto para handlers
 * com várias awaits encadeadas (DB → Stripe → DB → res).
 */
async function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  handler(req, res, next)
  const resJson = (res as unknown as { json: ReturnType<typeof vi.fn> }).json
  const nextMock = next as unknown as { mock: { calls: unknown[][] } }
  for (let i = 0; i < 50; i++) {
    if (nextMock.mock.calls.length > 0 || resJson.mock.calls.length > 0) return
    await new Promise((r) => setImmediate(r))
  }
}

function getNextError(next: NextFunction): AppError {
  const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]
  if (!(err instanceof AppError)) {
    throw new Error(`next foi chamado mas não com AppError: ${String(err)}`)
  }
  return err
}

// ─── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockedIsStripeConfigured.mockReturnValue(true)
  process.env.FRONTEND_URL = 'https://stage.patacerta.pt'
})

// ─── createSponsoredSlotCheckout ─────────────────────────────────────

describe('createSponsoredSlotCheckout — guards', () => {
  it('devolve 503 quando Stripe não está configurado', async () => {
    mockedIsStripeConfigured.mockReturnValue(false)
    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const err = getNextError(next)
    expect(err.statusCode).toBe(503)
    expect(err.code).toBe('STRIPE_NOT_CONFIGURED')
  })

  it('rejeita body inválido (breedId em falta) via Zod', async () => {
    const req = makeReq({ body: {} })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    expect(next).toHaveBeenCalled()
    // Zod lança ZodError directamente; não é AppError mas é capturado.
    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]
    expect(err).toBeDefined()
    expect((err as Error).name).toBe('ZodError')
  })

  it('404 BREEDER_NOT_FOUND se o utilizador não tem perfil de criador', async () => {
    mockedPrisma.breeder.findUnique.mockResolvedValue(null)
    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const err = getNextError(next)
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('BREEDER_NOT_FOUND')
  })

  it('403 BREEDER_NOT_VERIFIED se o criador está PENDING', async () => {
    mockedPrisma.breeder.findUnique.mockResolvedValue({
      id: 5,
      status: 'PENDING',
      businessName: 'Canil X',
      slug: 'canil-x',
    })
    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const err = getNextError(next)
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('BREEDER_NOT_VERIFIED')
  })

  it('404 BREED_NOT_FOUND quando a raça não existe', async () => {
    mockedPrisma.breeder.findUnique.mockResolvedValue({
      id: 5,
      status: 'VERIFIED',
      businessName: 'Canil X',
      slug: 'canil-x',
    })
    mockedPrisma.breed.findUnique.mockResolvedValue(null)
    const req = makeReq({ body: { breedId: 999 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const err = getNextError(next)
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('BREED_NOT_FOUND')
  })
})

describe('createSponsoredSlotCheckout — limites', () => {
  function setupVerifiedBreederAndBreed() {
    mockedPrisma.breeder.findUnique.mockResolvedValue({
      id: 5,
      status: 'VERIFIED',
      businessName: 'Canil X',
      slug: 'canil-x',
    })
    mockedPrisma.breed.findUnique.mockResolvedValue({
      id: 1,
      namePt: 'Labrador',
      nameSlug: 'labrador',
    })
  }

  it('409 SLOT_LIMIT_REACHED quando já há 3 slots ocupados', async () => {
    setupVerifiedBreederAndBreed()
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(3)

    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const err = getNextError(next)
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('SLOT_LIMIT_REACHED')
    expect(mockedPrisma.sponsoredBreedSlot.create).not.toHaveBeenCalled()
  })

  it('409 SLOT_LIMIT_REACHED também quando count > 3 (defensivo)', async () => {
    setupVerifiedBreederAndBreed()
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(5)

    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const err = getNextError(next)
    expect(err.code).toBe('SLOT_LIMIT_REACHED')
  })

  it('409 DUPLICATE_SLOT quando o criador já tem slot activo na raça', async () => {
    setupVerifiedBreederAndBreed()
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(1)
    mockedPrisma.sponsoredBreedSlot.findFirst.mockResolvedValue({
      id: 99,
      paymentStatus: 'PAID',
      status: 'ACTIVE',
    })

    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const err = getNextError(next)
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('DUPLICATE_SLOT')
    expect(mockedPrisma.sponsoredBreedSlot.create).not.toHaveBeenCalled()
  })

  it('countOccupyingSlots: filtra por (PAID|LEGACY) ACTIVE OR PENDING <24h', async () => {
    setupVerifiedBreederAndBreed()
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(0)
    mockedPrisma.sponsoredBreedSlot.findFirst.mockResolvedValue(null)
    mockedPrisma.sponsoredBreedSlot.create.mockResolvedValue({ id: 123 })
    mockedPrisma.sponsoredBreedSlot.update.mockResolvedValue({})
    mockSessionsCreate.mockResolvedValue({
      id: 'cs_test_xyz',
      url: 'https://checkout.stripe.com/c/pay/cs_test_xyz',
    })

    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    expect(mockedPrisma.sponsoredBreedSlot.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        breedId: 1,
        OR: expect.arrayContaining([
          expect.objectContaining({
            paymentStatus: { in: ['PAID', 'LEGACY'] },
            status: 'ACTIVE',
          }),
          expect.objectContaining({
            paymentStatus: 'PENDING',
            createdAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        ]),
      }),
    })
  })
})

describe('createSponsoredSlotCheckout — happy path', () => {
  function setupHappyPath() {
    mockedPrisma.breeder.findUnique.mockResolvedValue({
      id: 5,
      status: 'VERIFIED',
      businessName: 'Canil X',
      slug: 'canil-x',
    })
    mockedPrisma.breed.findUnique.mockResolvedValue({
      id: 1,
      namePt: 'Labrador',
      nameSlug: 'labrador',
    })
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(0)
    mockedPrisma.sponsoredBreedSlot.findFirst.mockResolvedValue(null)
    mockedPrisma.sponsoredBreedSlot.create.mockResolvedValue({ id: 123 })
    mockedPrisma.sponsoredBreedSlot.update.mockResolvedValue({})
    mockSessionsCreate.mockResolvedValue({
      id: 'cs_test_abc',
      url: 'https://checkout.stripe.com/c/pay/cs_test_abc',
    })
  }

  it('cria slot PENDING/PAUSED com placeholders e price/currency correctos', async () => {
    setupHappyPath()
    const req = makeReq({ body: { breedId: 1 }, userId: 7 })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    expect(mockedPrisma.sponsoredBreedSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          breederId: 5,
          breedId: 1,
          status: 'PAUSED',
          paymentStatus: 'PENDING',
          priceCents: 1000,
          currency: 'EUR',
          paidByUserId: 7,
          startsAt: expect.any(Date),
          endsAt: expect.any(Date),
        }),
      }),
    )
  })

  it('chama Stripe Checkout com payment_method_types=[card,multibanco], locale=pt, expires_at=+23h', async () => {
    setupHappyPath()
    const req = makeReq({ body: { breedId: 1 }, email: 'novo@example.com' })
    const res = makeRes()
    const next = makeNext()

    const tBefore = Math.floor(Date.now() / 1000)
    await invoke(createSponsoredSlotCheckout, req, res, next)
    const tAfter = Math.floor(Date.now() / 1000)

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1)
    const callArg = mockSessionsCreate.mock.calls[0][0]
    expect(callArg).toMatchObject({
      mode: 'payment',
      payment_method_types: ['card', 'multibanco'],
      locale: 'pt',
      customer_email: 'novo@example.com',
    })
    expect(callArg.line_items[0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: 1000,
      },
    })
    expect(callArg.line_items[0].price_data.product_data.name).toContain('Labrador')
    // metadata correlation
    expect(callArg.metadata).toEqual({
      slotId: '123',
      breederId: '5',
      breedId: '1',
      userId: '7',
    })
    // expires_at = now + 23h (Stripe limita Checkout a 24h max em modo
    // `payment`; usamos 23h para margem de seguranca contra clock drift).
    const expectedMin = tBefore + 23 * 60 * 60
    const expectedMax = tAfter + 23 * 60 * 60
    expect(callArg.expires_at).toBeGreaterThanOrEqual(expectedMin)
    expect(callArg.expires_at).toBeLessThanOrEqual(expectedMax + 1)
  })

  it('URLs de retorno usam FRONTEND_URL (primeira entrada se múltiplas)', async () => {
    setupHappyPath()
    process.env.FRONTEND_URL = 'https://stage.patacerta.pt,https://other.example.com'

    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const callArg = mockSessionsCreate.mock.calls[0][0]
    expect(callArg.success_url).toBe(
      'https://stage.patacerta.pt/area-pessoal?tab=destaque&checkout=success&session_id={CHECKOUT_SESSION_ID}',
    )
    expect(callArg.cancel_url).toBe(
      'https://stage.patacerta.pt/area-pessoal?tab=destaque&checkout=cancelled',
    )
  })

  it('URLs caem para localhost se FRONTEND_URL não estiver definido', async () => {
    setupHappyPath()
    delete process.env.FRONTEND_URL

    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    const callArg = mockSessionsCreate.mock.calls[0][0]
    expect(callArg.success_url).toContain('http://localhost:5173')
  })

  it('persiste stripeCheckoutSessionId no slot após criar a sessão', async () => {
    setupHappyPath()
    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    expect(mockedPrisma.sponsoredBreedSlot.update).toHaveBeenCalledWith({
      where: { id: 123 },
      data: { stripeCheckoutSessionId: 'cs_test_abc' },
    })
  })

  it('devolve 201 com sessionId, url e slotId', async () => {
    setupHappyPath()
    const req = makeReq({ body: { breedId: 1 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(createSponsoredSlotCheckout, req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      sessionId: 'cs_test_abc',
      url: 'https://checkout.stripe.com/c/pay/cs_test_abc',
      slotId: 123,
    })
  })
})

// ─── getSponsoredSlotAvailability ────────────────────────────────────

// Nota: a validação de breedId é feita pelo middleware `validate(...)` na router
// (ver sponsoredSlotAvailabilityQuerySchema). O controller assume que req.query
// já vem parsed/coerced — testar erros de validação é responsabilidade da suite
// de middleware/schema, não deste controller.
describe('getSponsoredSlotAvailability', () => {
  it('devolve disponibilidade com 3 slots livres quando occupied=0', async () => {
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(0)
    const req = makeReq({ query: { breedId: 5 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(getSponsoredSlotAvailability, req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({
      breedId: 5,
      occupied: 0,
      maxSlots: 3,
      available: 3,
      priceCents: 1000,
      currency: 'EUR',
      durationDays: 30,
    })
  })

  it('devolve available=0 (nunca negativo) quando occupied>maxSlots', async () => {
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(7)
    const req = makeReq({ query: { breedId: 5 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(getSponsoredSlotAvailability, req, res, next)

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ occupied: 7, available: 0 }))
  })
})

// ─── listMySponsoredSlots ────────────────────────────────────────────

describe('listMySponsoredSlots', () => {
  it('404 BREEDER_NOT_FOUND quando o utilizador não tem perfil de criador', async () => {
    mockedPrisma.breeder.findUnique.mockResolvedValue(null)
    const req = makeReq({ query: { page: 1, limit: 20 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(listMySponsoredSlots, req, res, next)

    const err = getNextError(next)
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('BREEDER_NOT_FOUND')
  })

  it('devolve { data, pagination } ordenados por createdAt desc', async () => {
    mockedPrisma.breeder.findUnique.mockResolvedValue({ id: 5 })
    const slots = [
      { id: 2, breedId: 1, paymentStatus: 'PAID', status: 'ACTIVE' },
      { id: 1, breedId: 2, paymentStatus: 'LEGACY', status: 'ACTIVE' },
    ]
    mockedPrisma.sponsoredBreedSlot.findMany.mockResolvedValue(slots)
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(2)

    const req = makeReq({ query: { page: 1, limit: 20 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(listMySponsoredSlots, req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(mockedPrisma.sponsoredBreedSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { breederId: 5 },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      }),
    )
    expect(res.json).toHaveBeenCalledWith({
      data: slots,
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    })
  })

  it('apenas devolve slots do criador autenticado (filtro breederId)', async () => {
    mockedPrisma.breeder.findUnique.mockResolvedValue({ id: 5 })
    mockedPrisma.sponsoredBreedSlot.findMany.mockResolvedValue([])
    mockedPrisma.sponsoredBreedSlot.count.mockResolvedValue(0)

    const req = makeReq({ userId: 7, query: { page: 1, limit: 20 } })
    const res = makeRes()
    const next = makeNext()

    await invoke(listMySponsoredSlots, req, res, next)

    // findUnique é chamado com userId do JWT.
    expect(mockedPrisma.breeder.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    )
    // findMany usa o id devolvido (5), não o userId.
    expect(mockedPrisma.sponsoredBreedSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { breederId: 5 } }),
    )
  })
})
