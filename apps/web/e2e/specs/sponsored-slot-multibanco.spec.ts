/**
 * E2E do fluxo Multibanco — simula o webhook 2-step assincrono.
 *
 * Diferenca face ao spec `sponsored-slot-webhook.spec.ts`:
 *   Aqui cobrimos o fluxo Multibanco/MB Way, em que o pagamento NAO e'
 *   sincrono. A Stripe envia primeiro `checkout.session.completed` com
 *   `payment_status='unpaid'` (referencia ATM emitida) e SO depois, quando
 *   o utilizador efectivamente paga no banco/MB Way, envia
 *   `checkout.session.async_payment_succeeded` com payment_status='paid'.
 *
 * O nosso webhook tem que:
 *   1. Ignorar o primeiro evento (slot mantem-se PAUSED+PENDING).
 *   2. Activar no segundo evento (slot fica ACTIVE+PAID).
 *
 * Fluxo do teste:
 *   1. Login + descobrir raca com vaga.
 *   2. POST /payments/sponsored-slot/checkout -> obtem sessionId real.
 *   3. POST /webhooks/stripe com `checkout.session.completed` +
 *      payment_status='unpaid' (assinado).
 *   4. Asserir que slot continua PAUSED+PENDING.
 *   5. POST /webhooks/stripe com `checkout.session.async_payment_succeeded`
 *      + payment_status='paid' (assinado).
 *   6. Polling /mine ate slot ficar ACTIVE+PAID.
 *   7. Cleanup admin.
 *
 * Skipped se E2E_STRIPE_WEBHOOK_SECRET estiver em falta.
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

const POLL_TIMEOUT = 30_000

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

// IMPORTANTE: ver header dos outros sponsored-slot specs — usar --workers=1
// quando se corre em conjunto com eles (mesmo user, race em refresh-token).

test.describe('Sponsored Slot — fluxo Multibanco (webhook async 2-step)', () => {
  test.skip(!WEBHOOK_SECRET, 'E2E_STRIPE_WEBHOOK_SECRET em falta.')
  test.skip(
    !!process.env.E2E_SKIP_DESTRUCTIVE,
    'Destrutivo: cria slot, sessao Stripe e activa via webhook simulado.',
  )

  test('Multibanco unpaid -> async_payment_succeeded activa slot', async ({ page, request }) => {
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
    console.log(`[E2E mb] Raca alvo: ${target!.namePt} (id=${target!.id})`)

    // ── 2. Criar checkout session ─────────────────────────────────────────
    const coRes = await request.post(`${API_BASE_URL}/payments/sponsored-slot/checkout`, {
      data: { breedId: target!.id },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(coRes.ok(), `checkout falhou: ${coRes.status()} ${await coRes.text()}`).toBe(true)
    const co = (await coRes.json()) as CheckoutResponse
    // eslint-disable-next-line no-console
    console.log(`[E2E mb] sessionId=${co.sessionId} slotId=${co.slotId}`)

    // ── Helper para enviar webhook assinado ───────────────────────────────
    async function sendWebhook(payload: object): Promise<void> {
      const body = JSON.stringify(payload)
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: WEBHOOK_SECRET,
      })
      const r = await request.post(`${API_BASE_URL}/webhooks/stripe`, {
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': signature,
        },
        data: body,
      })
      expect(r.ok(), `webhook respondeu ${r.status()}: ${await r.text()}`).toBe(true)
    }

    async function fetchSlot(): Promise<MySlot | undefined> {
      const r = await request.get(`${API_BASE_URL}/payments/sponsored-slot/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok()) return undefined
      const body = (await r.json()) as { data: MySlot[] }
      return body.data.find((s) => s.id === co.slotId)
    }

    // ── 3. Webhook 1: checkout.session.completed (unpaid) ─────────────────
    // Comportamento esperado: webhook responde 200 mas NAO activa slot.
    const eventId1 = `evt_test_e2e_mb1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await sendWebhook({
      id: eventId1,
      object: 'event',
      api_version: '2024-04-10',
      created: Math.floor(Date.now() / 1000),
      type: 'checkout.session.completed',
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: co.sessionId,
          object: 'checkout.session',
          payment_status: 'unpaid', // <-- chave do teste: Multibanco pendente
          status: 'complete',
          mode: 'payment',
          payment_method_types: ['multibanco'],
        },
      },
    })
    // eslint-disable-next-line no-console
    console.log('[E2E mb] webhook 1 (unpaid) -> 200 OK')

    // ── 4. Asserir slot continua PENDING ──────────────────────────────────
    // Pequena espera para garantir que o handler corre (e' sincrono mas
    // damos um buffer minimo).
    await new Promise((r) => setTimeout(r, 1_000))
    const slotAfter1 = await fetchSlot()
    expect(slotAfter1, 'Slot tem de existir apos webhook 1').toBeTruthy()
    expect(slotAfter1!.paymentStatus, 'Slot NAO pode ficar PAID com payment_status=unpaid').toBe(
      'PENDING',
    )
    expect(slotAfter1!.status, 'Slot NAO pode ficar ACTIVE com unpaid').toBe('PAUSED')
    // eslint-disable-next-line no-console
    console.log(
      `[E2E mb] Slot mantem-se ${slotAfter1!.status}+${slotAfter1!.paymentStatus} (correcto)`,
    )

    // ── 5. Webhook 2: async_payment_succeeded (paid) ──────────────────────
    const eventId2 = `evt_test_e2e_mb2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const fakePI = `pi_test_e2e_mb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await sendWebhook({
      id: eventId2,
      object: 'event',
      api_version: '2024-04-10',
      created: Math.floor(Date.now() / 1000),
      type: 'checkout.session.async_payment_succeeded',
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: co.sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: fakePI,
          status: 'complete',
          mode: 'payment',
          payment_method_types: ['multibanco'],
        },
      },
    })
    // eslint-disable-next-line no-console
    console.log('[E2E mb] webhook 2 (async_payment_succeeded) -> 200 OK')

    // ── 6. Polling slot ate ACTIVE+PAID ───────────────────────────────────
    let activated: MySlot | null = null
    const start = Date.now()
    while (Date.now() - start < POLL_TIMEOUT) {
      const m = await fetchSlot()
      if (m && m.status === 'ACTIVE' && m.paymentStatus === 'PAID') {
        activated = m
        break
      }
      await new Promise((r) => setTimeout(r, 1_000))
    }
    expect(
      activated,
      `Slot ${co.slotId} tinha de ficar ACTIVE+PAID em ${POLL_TIMEOUT}ms apos async_payment_succeeded`,
    ).toBeTruthy()
    // eslint-disable-next-line no-console
    console.log(
      `[E2E mb] Slot activado: ${activated!.id} ${activated!.status}+${activated!.paymentStatus}`,
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
      console.log(`[E2E mb] Cleanup slot ${co.slotId} -> ${del.status()}`)
    }
  })
})
