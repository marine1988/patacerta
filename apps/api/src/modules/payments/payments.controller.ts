// ============================================
// PataCerta — Payments Controller
// ============================================
//
// Endpoints de pagamento via Stripe Checkout. O criador autenticado
// compra um Sponsored Slot (destaque no simulador de raça) por um
// preço fixo, durante um período fixo (10€ / 30 dias no MVP).
//
// Fluxo:
// 1. Frontend chama POST /api/payments/sponsored-slot/checkout com
//    { breedId } (criador inferido do JWT via requireBreederProfile).
// 2. Validamos: criador VERIFIED, raça existe, ainda há vaga
//    (max 3 slots ACTIVE+PENDING não-expirados por raça).
// 3. Criamos slot com paymentStatus=PENDING, status=PAUSED. As datas
//    são placeholders (now / now+30d) e serão corrigidas no webhook
//    para o instante exacto do pagamento confirmado.
// 4. Geramos Stripe Checkout Session com payment_method_types=
//    ['card', 'multibanco'] (suporta cartão, Apple/Google Pay,
//    Multibanco; MB Way é activado automaticamente para residentes PT
//    quando configurado na dashboard Stripe).
// 5. Retornamos { url } para o frontend redireccionar.
//
// O slot fica "reservado" enquanto PENDING. Multibanco pode demorar
// dias até a referência ser paga. Se o pagamento falhar/expirar, o
// webhook async_payment_failed marca FAILED e o slot deixa de contar
// para o limite de 3.

import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'
import { getFrontendBaseUrl } from '../../lib/env.js'
import { AppError } from '../../middleware/error-handler.js'
import {
  getStripe,
  isStripeConfigured,
  SPONSORED_SLOT_PRICE_CENTS,
  SPONSORED_SLOT_DURATION_DAYS,
  SPONSORED_SLOT_CURRENCY,
} from '../../lib/stripe.js'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

const MAX_SLOTS_PER_BREED = 3

const createCheckoutSchema = z.object({
  breedId: z.number().int().positive(),
})

/**
 * Conta slots que ocupam vaga numa dada raça:
 *   - PAID/LEGACY com status ACTIVE e dentro da janela
 *   - PENDING (à espera de pagamento) ainda não-expirado pelo Stripe
 *
 * FAILED, REFUNDED e EXPIRED não contam. Aceita um cliente Prisma
 * opcional (para correr dentro de transaccao).
 */
async function countOccupyingSlots(
  breedId: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const now = new Date()
  return client.sponsoredBreedSlot.count({
    where: {
      breedId,
      OR: [
        {
          paymentStatus: { in: ['PAID', 'LEGACY'] },
          status: 'ACTIVE',
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        {
          paymentStatus: 'PENDING',
          // Sessão Checkout do Stripe expira em 24h por defeito; usamos
          // createdAt como proxy. Slot PENDING criado há mais de 24h é
          // considerado expirado e não conta.
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      ],
    },
  })
}

export const createSponsoredSlotCheckout = asyncHandler(async (req, res) => {
  if (!isStripeConfigured()) {
    throw new AppError(503, 'Pagamentos temporariamente indisponíveis', 'STRIPE_NOT_CONFIGURED')
  }

  const { breedId } = createCheckoutSchema.parse(req.body)
  const userId = req.user!.userId

  // Carregar breeder do utilizador autenticado (requireBreederProfile
  // já garantiu que existe).
  const breeder = await prisma.breeder.findUnique({
    where: { userId },
    select: { id: true, status: true, businessName: true, slug: true },
  })
  if (!breeder) {
    throw new AppError(404, 'Perfil de criador não encontrado', 'BREEDER_NOT_FOUND')
  }
  if (breeder.status !== 'VERIFIED') {
    throw new AppError(
      403,
      'Apenas criadores verificados podem comprar destaque no simulador',
      'BREEDER_NOT_VERIFIED',
    )
  }

  const breed = await prisma.breed.findUnique({
    where: { id: breedId },
    select: { id: true, namePt: true, nameSlug: true },
  })
  if (!breed) {
    throw new AppError(404, 'Raça não encontrada', 'BREED_NOT_FOUND')
  }

  // Criar slot PENDING dentro de uma transaccao Serializable. Sem
  // isolamento, duas requisicoes concorrentes podem ambas ler
  // occupied=2 e ambas criar — resultando em 4+ slots para a mesma
  // raca, violando o contrato dos 3-slots-max. Serializable forca o
  // Postgres a detectar o conflito e abortar uma das transaccoes
  // (P2034). O retry e' implicito: o utilizador recebe 409 e tenta
  // de novo (raro em pratica — janela de race < 1s).
  //
  // As datas sao placeholders — o webhook checkout.session.completed
  // (ou async_payment_succeeded para Multibanco) vai re-escrever
  // startsAt=now / endsAt=+30d no instante exacto do pagamento
  // confirmado.
  const placeholderStarts = new Date()
  const placeholderEnds = new Date(
    placeholderStarts.getTime() + SPONSORED_SLOT_DURATION_DAYS * 24 * 60 * 60 * 1000,
  )

  let slot: { id: number }
  try {
    slot = await prisma.$transaction(
      async (tx) => {
        const occupied = await countOccupyingSlots(breedId, tx)
        if (occupied >= MAX_SLOTS_PER_BREED) {
          throw new AppError(
            409,
            `Já existem ${MAX_SLOTS_PER_BREED} destaques activos para esta raça. Tente noutra raça ou aguarde que um destaque expire.`,
            'SLOT_LIMIT_REACHED',
          )
        }

        // Já tem slot activo/pendente próprio nesta raça? Evitar duplicação.
        const existingOwnSlot = await tx.sponsoredBreedSlot.findFirst({
          where: {
            breederId: breeder.id,
            breedId,
            paymentStatus: { in: ['PAID', 'PENDING', 'LEGACY'] },
            status: { in: ['ACTIVE', 'PAUSED'] },
            endsAt: { gte: new Date() },
          },
        })
        if (existingOwnSlot) {
          throw new AppError(
            409,
            'Já tem um destaque activo ou pendente para esta raça',
            'DUPLICATE_SLOT',
          )
        }

        return tx.sponsoredBreedSlot.create({
          data: {
            breederId: breeder.id,
            breedId: breed.id,
            startsAt: placeholderStarts,
            endsAt: placeholderEnds,
            status: 'PAUSED',
            paymentStatus: 'PENDING',
            priceCents: SPONSORED_SLOT_PRICE_CENTS,
            currency: SPONSORED_SLOT_CURRENCY.toUpperCase(),
            paidByUserId: userId,
          },
          select: { id: true },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (err) {
    // P2034: serialization failure — duas requisicoes concorrentes
    // pediram a mesma vaga ao mesmo tempo. Convertemos em 409 para o
    // cliente decidir se quer tentar de novo.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new AppError(
        409,
        'Conflito momentâneo ao reservar o destaque. Tente novamente.',
        'SLOT_RESERVATION_CONFLICT',
      )
    }
    throw err
  }

  // Construir URLs de retorno. Helper centralizado em lib/env.ts —
  // suporta CSV em FRONTEND_URL (pega na primeira entrada) e falha em
  // prod/stage se a variavel nao estiver definida (evita silently
  // redirecionar para localhost).
  const frontendUrl = getFrontendBaseUrl()
  const successUrl = `${frontendUrl}/area-pessoal?tab=destaque&checkout=success&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${frontendUrl}/area-pessoal?tab=destaque&checkout=cancelled`

  const stripe = getStripe()
  // Importante: se a chamada a Stripe falhar (ex: chave invalida, rate
  // limit, parametro rejeitado), apagamos o slot que acabamos de criar.
  // Caso contrario fica um PAUSED+PENDING orfao a ocupar vaga (ate' 24h
  // no countOccupyingSlots) e a impedir o proprio criador de tentar de
  // novo (DUPLICATE_SLOT). Esta limpeza torna o endpoint idempotente do
  // ponto de vista do utilizador.
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'multibanco'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: SPONSORED_SLOT_CURRENCY,
            unit_amount: SPONSORED_SLOT_PRICE_CENTS,
            product_data: {
              name: `Destaque no Simulador — ${breed.namePt}`,
              description: `Aparecer no simulador de raça do PataCerta como criador recomendado para "${breed.namePt}" durante ${SPONSORED_SLOT_DURATION_DAYS} dias.`,
            },
          },
        },
      ],
      metadata: {
        slotId: String(slot.id),
        breederId: String(breeder.id),
        breedId: String(breed.id),
        userId: String(userId),
      },
      // Em modo `payment` (one-shot, não subscription), a payment_intent
      // criada herda automaticamente este metadata (não duplicado aqui).
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: 'pt',
      customer_email: req.user!.email,
      // A Stripe limita `expires_at` a um maximo de 24h apos a criacao da
      // sessao Checkout (em modo `payment`). Usamos 23h para deixar margem
      // de seguranca contra clock drift entre os nossos servidores e a
      // Stripe. Para Multibanco isto nao limita o pagamento da referencia
      // em si — apenas a janela em que o cliente pode abrir a pagina de
      // Checkout para gerar/ver a referencia. Apos a referencia gerada,
      // o cliente tem ate 7 dias para pagar (controlado pela Stripe).
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
    })
  } catch (err) {
    // Cleanup do slot orfao. Best-effort: se o delete falhar, deixamos
    // o erro original ser lancado para nao mascarar a causa-raiz.
    await prisma.sponsoredBreedSlot.delete({ where: { id: slot.id } }).catch(() => {
      /* ignore */
    })
    throw err
  }

  // Persistir o ID da sessão para podermos correlacionar no webhook.
  await prisma.sponsoredBreedSlot.update({
    where: { id: slot.id },
    data: { stripeCheckoutSessionId: session.id },
  })

  res.status(201).json({
    sessionId: session.id,
    url: session.url,
    slotId: slot.id,
  })
})

/**
 * GET /api/payments/sponsored-slot/availability?breedId=N
 * Permite ao FE saber se ainda há vaga numa raça antes de mostrar o
 * botão de comprar. Público (não revela informação sensível).
 */
export const getSponsoredSlotAvailability = asyncHandler(async (req, res) => {
  const breedId = parseInt(String(req.query.breedId || ''), 10)
  if (isNaN(breedId) || breedId <= 0) {
    throw new AppError(400, 'breedId inválido', 'INVALID_BREED_ID')
  }
  const occupied = await countOccupyingSlots(breedId)
  res.json({
    breedId,
    occupied,
    maxSlots: MAX_SLOTS_PER_BREED,
    available: Math.max(0, MAX_SLOTS_PER_BREED - occupied),
    priceCents: SPONSORED_SLOT_PRICE_CENTS,
    currency: SPONSORED_SLOT_CURRENCY.toUpperCase(),
    durationDays: SPONSORED_SLOT_DURATION_DAYS,
  })
})

/**
 * GET /api/payments/sponsored-slot/mine
 * Lista slots do criador autenticado (todos os estados de pagamento)
 * para a dashboard mostrar histórico e estado actual.
 */
export const listMySponsoredSlots = asyncHandler(async (req, res) => {
  const breeder = await prisma.breeder.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  })
  if (!breeder) {
    throw new AppError(404, 'Perfil de criador não encontrado', 'BREEDER_NOT_FOUND')
  }

  const slots = await prisma.sponsoredBreedSlot.findMany({
    where: { breederId: breeder.id },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      breedId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      paymentStatus: true,
      priceCents: true,
      currency: true,
      paidAt: true,
      stripeReceiptUrl: true,
      impressionCount: true,
      clickCount: true,
      createdAt: true,
      breed: { select: { id: true, namePt: true, nameSlug: true } },
    },
  })

  res.json({ data: slots })
})
