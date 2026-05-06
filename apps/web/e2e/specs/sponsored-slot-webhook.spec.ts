/**
 * E2E do webhook Stripe — simula `checkout.session.completed` com assinatura.
 *
 * Porque existe este teste:
 *   O spec `sponsored-slot-checkout.spec.ts` para no redirect para
 *   checkout.stripe.com (a UI hospedada da Stripe e' instavel para automacao).
 *   Aqui cobrimos o lado oposto: o nosso webhook valida correctamente um
 *   evento `checkout.session.completed` assinado e activa o slot na DB.
 *
 * Fluxo:
 *  1. Login API como criador VERIFIED + descobrir raca com vaga.
 *  2. POST /api/payments/sponsored-slot/checkout — cria slot PAUSED+PENDING
 *     e retorna `sessionId` real da Stripe (test mode).
 *  3. Construir payload `checkout.session.completed` com:
 *       - data.object.id = sessionId real
 *       - data.object.payment_status = 'paid'
 *       - data.object.payment_intent = 'pi_test_e2e_<rand>'  (string falsa)
 *       - event.id = 'evt_test_e2e_<rand>'                   (idempotencia)
 *  4. Gerar header `stripe-signature` valido com
 *     `stripe.webhooks.generateTestHeaderString({ payload, secret })`.
 *  5. POST /api/webhooks/stripe com body cru + header.
 *  6. Polling /payments/sponsored-slot/mine ate o slot ficar ACTIVE+PAID.
 *  7. Cleanup: DELETE admin do slot.
 *
 * Notas sobre o `payment_intent` falso:
 *   O webhook tenta `stripe.paymentIntents.retrieve(pi_test_e2e_xxx)` para
 *   buscar o receipt_url. Esse retrieve falha (PI nao existe), o webhook
 *   apanha a excepcao com try/catch, regista warning e segue. O slot
 *   fica activado com `stripeReceiptUrl=null` — comportamento aceitavel
 *   e comprovado em src/modules/webhooks/stripe-webhook.controller.ts:191.
 *
 * Pre-requisitos:
 *  - Variaveis env (alem das normais do checkout spec):
 *      E2E_STRIPE_WEBHOOK_SECRET=whsec_xxx       (test mode)
 *  - Sem este secret, o teste e' SKIPPED (porque nao consegue assinar
 *    o payload de forma que o backend aceite).
 */
import { test, expect } from '@playwright/test'
import Stripe from 'stripe'
import { loginViaApi } from '../fixtures/auth'
import { API_BASE_URL } from '../fixtures/demo-data'

const BREEDER_EMAIL = process.env.E2E_BREEDER_EMAIL || 'canil.alvalade@example.pt'
const BREEDER_PASSWORD = process.env.E2E_BREEDER_PASSWORD || 'DemoPass123'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@patacerta.pt'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123!'
const WEBHOOK_SECRET = process.env.E2E_STRIPE_WEBHOOK_SECRET || ''

const WEBHOOK_TIMEOUT = 30_000

interface AvailabilityResponse {
  breedId: number
  available: number
}
interface BreedListItem {
  id: number
  namePt: string
  nameSlug: string
}
interface MySlot {
  id: number
  breedId: number
  status: string
  paymentStatus: string
  stripeCheckoutSessionId?: string | null
}
interface CheckoutResponse {
  sessionId: string
  url: string
  slotId: number
}

test.describe.configure({ mode: 'serial' })

test.describe('Sponsored Slot — webhook checkout.session.completed', () => {
  test.skip(
    !WEBHOOK_SECRET,
    'E2E_STRIPE_WEBHOOK_SECRET em falta — sem isto nao podemos assinar payloads.',
  )
  test.skip(
    !!process.env.E2E_SKIP_DESTRUCTIVE,
    'Destrutivo: cria slot, sessao Stripe e activa via webhook simulado.',
  )

  test('webhook assinado activa slot pendente para PAID/ACTIVE', async ({ page, request }) => {
    test.setTimeout(120_000)

    // ── 1. Login + descobrir raca ─────────────────────────────────────────
    await loginViaApi(request, page, BREEDER_EMAIL, BREEDER_PASSWORD)
    const accessToken = await page.evaluate(() => window.localStorage.getItem('access_token'))
    expect(accessToken).toBeTruthy()

    const breedsRes = await request.get(`${API_BASE_URL}/breeds`)
    const breedsBody = (await breedsRes.json()) as
      | BreedListItem[]
      | { breeds?: BreedListItem[]; data?: BreedListItem[] }
    const breeds: BreedListItem[] = Array.isArray(breedsBody)
      ? breedsBody
      : (breedsBody.breeds ?? breedsBody.data ?? [])

    const mineRes = await request.get(`${API_BASE_URL}/payments/sponsored-slot/mine`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const mineBody = mineRes.ok()
      ? ((await mineRes.json()) as { data: MySlot[] })
      : { data: [] as MySlot[] }
    const owned = new Set(mineBody.data.map((s) => s.breedId))

    let target: BreedListItem | null = null
    for (const b of breeds.slice(0, 30)) {
      if (owned.has(b.id)) continue
      const ar = await request.get(
        `${API_BASE_URL}/payments/sponsored-slot/availability?breedId=${b.id}`,
      )
      if (!ar.ok()) continue
      const a = (await ar.json()) as AvailabilityResponse
      if (a.available > 0) {
        target = b
        break
      }
    }
    expect(target, 'Tem de existir raca disponivel').not.toBeNull()
    // eslint-disable-next-line no-console
    console.log(`[E2E webhook] Raca alvo: ${target!.namePt} (id=${target!.id})`)

    // ── 2. Criar checkout session ─────────────────────────────────────────
    const coRes = await request.post(`${API_BASE_URL}/payments/sponsored-slot/checkout`, {
      data: { breedId: target!.id },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(coRes.ok(), `checkout falhou: ${coRes.status()} ${await coRes.text()}`).toBe(true)
    const co = (await coRes.json()) as CheckoutResponse
    expect(co.sessionId).toMatch(/^cs_test_/)
    // eslint-disable-next-line no-console
    console.log(`[E2E webhook] sessionId=${co.sessionId} slotId=${co.slotId}`)

    // ── 3. Construir payload checkout.session.completed ───────────────────
    const eventId = `evt_test_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const fakePI = `pi_test_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const created = Math.floor(Date.now() / 1000)

    const eventPayload = {
      id: eventId,
      object: 'event' as const,
      api_version: '2024-04-10',
      created,
      type: 'checkout.session.completed' as const,
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: co.sessionId,
          object: 'checkout.session' as const,
          payment_status: 'paid' as const,
          payment_intent: fakePI,
          status: 'complete' as const,
          mode: 'payment' as const,
          // Restantes campos sao opcionais para o nosso handler.
        },
      },
    }
    const payloadString = JSON.stringify(eventPayload)

    // ── 4. Assinar com stripe SDK ─────────────────────────────────────────
    // generateTestHeaderString gera o cabecalho v1=... que constructEvent
    // valida server-side com STRIPE_WEBHOOK_SECRET.
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: WEBHOOK_SECRET,
    })

    // ── 5. POST ao webhook ────────────────────────────────────────────────
    const wRes = await request.post(`${API_BASE_URL}/webhooks/stripe`, {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      // CRITICO: enviar string EXACTA (mesma que foi assinada). O Playwright
      // permite passar string como `data` — assim o body raw bate certo.
      data: payloadString,
    })
    expect(wRes.ok(), `webhook respondeu ${wRes.status()}: ${await wRes.text()}`).toBe(true)
    const wBody = (await wRes.json()) as { received: boolean }
    expect(wBody.received).toBe(true)
    // eslint-disable-next-line no-console
    console.log(`[E2E webhook] webhook 200 OK`)

    // ── 6. Polling slot ate ACTIVE+PAID ───────────────────────────────────
    let slotActivated = false
    let activatedSlot: MySlot | null = null
    const start = Date.now()
    while (Date.now() - start < WEBHOOK_TIMEOUT) {
      const r = await request.get(`${API_BASE_URL}/payments/sponsored-slot/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (r.ok()) {
        const body = (await r.json()) as { data: MySlot[] }
        const m = body.data.find((s) => s.id === co.slotId)
        if (m && m.status === 'ACTIVE' && m.paymentStatus === 'PAID') {
          slotActivated = true
          activatedSlot = m
          break
        }
      }
      await new Promise((r) => setTimeout(r, 1_000))
    }
    expect(
      slotActivated,
      `Slot ${co.slotId} tinha de ficar ACTIVE+PAID em ${WEBHOOK_TIMEOUT}ms apos webhook`,
    ).toBe(true)
    // eslint-disable-next-line no-console
    console.log(
      `[E2E webhook] Slot activado: ${activatedSlot!.id} status=${activatedSlot!.status} payment=${activatedSlot!.paymentStatus}`,
    )

    // ── 7. Cleanup ────────────────────────────────────────────────────────
    const al = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    if (al.ok()) {
      const ab = (await al.json()) as { accessToken: string }
      const del = await request.delete(`${API_BASE_URL}/admin/sponsored-slots/${co.slotId}`, {
        headers: { Authorization: `Bearer ${ab.accessToken}` },
      })
      // eslint-disable-next-line no-console
      console.log(`[E2E webhook] Cleanup slot ${co.slotId} -> ${del.status()}`)
    }
  })
})
