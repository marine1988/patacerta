/**
 * E2E do fluxo de compra de Sponsored Slot — fase 1 (até ao redirect Stripe).
 *
 * Fluxo coberto:
 *  1. Login programatico via API como criador VERIFIED.
 *  2. Descobrir uma raca onde o criador AINDA NAO tem slot e que tem vaga
 *     (via /api/payments/sponsored-slot/availability + /mine).
 *  3. Navegar para Dashboard > Destaque, abrir modal de compra.
 *  4. Seleccionar raca e clicar "Avancar para pagamento".
 *  5. Asserir redirect para checkout.stripe.com com produto/preco/email
 *     correctos visíveis na pagina hospedada.
 *  6. Cleanup: apagar o slot PENDING criado, via DELETE admin
 *     /api/admin/sponsored-slots/:id, para o teste ser idempotente.
 *
 * Decisao de design (importante!):
 *  Nao automatizamos a UI hospedada do Stripe Checkout. A pagina e' frequentemente
 *  re-arranjada pela Stripe (A/B testing) e a sua suite de iframes torna o
 *  preenchimento de cartao instavel em CI. A cobertura do webhook (que e' o
 *  unico codigo NOSSO depois do redirect) e' feita no spec separado
 *  `sponsored-slot-webhook.spec.ts`, que simula `checkout.session.completed`
 *  com assinatura valida via `stripe.webhooks.generateTestHeaderString()`.
 *
 * Pre-requisitos:
 *  - Stage com chaves Stripe (test mode) configuradas.
 *  - Admin seedado para cleanup (admin@patacerta.pt / AdminPass123!).
 *  - Variaveis env:
 *      E2E_BASE_URL=https://stage.patacerta.pt
 *      E2E_API_URL=https://stage.patacerta.pt/api
 *      E2E_BREEDER_EMAIL=canil.alvalade@example.pt
 *      E2E_BREEDER_PASSWORD=DemoPass123
 *      E2E_ADMIN_EMAIL=admin@patacerta.pt          (default fornecido)
 *      E2E_ADMIN_PASSWORD=AdminPass123!            (default fornecido)
 */
import { test, expect } from '@playwright/test'
import { loginViaApi } from '../fixtures/auth'
import { API_BASE_URL } from '../fixtures/demo-data'

const BREEDER_EMAIL = process.env.E2E_BREEDER_EMAIL || 'canil.alvalade@example.pt'
const BREEDER_PASSWORD = process.env.E2E_BREEDER_PASSWORD || 'DemoPass123'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@patacerta.pt'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123!'

const STRIPE_TIMEOUT = 60_000

interface AvailabilityResponse {
  breedId: number
  occupied: number
  maxSlots: number
  available: number
  priceCents: number
  currency: string
  durationDays: number
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

test.describe.configure({ mode: 'serial' })

// IMPORTANTE: este spec e o `sponsored-slot-webhook.spec.ts` mexem no MESMO
// criador (canil.alvalade@example.pt) e fazem login concorrente do mesmo
// user, o que causa 500 INTERNAL_ERROR no backend (race em refresh-token
// rotation). Quando se corre os dois juntos, usar `--workers=1`:
//   playwright test e2e/specs/sponsored-slot-*.spec.ts --workers=1

test.describe('Sponsored Slot — checkout até Stripe', () => {
  test.skip(
    !!process.env.E2E_SKIP_DESTRUCTIVE,
    'Destrutivo: cria sessao Stripe (test mode) e slot PENDING.',
  )

  test('criador inicia checkout e e redireccionado para Stripe com produto correcto', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)

    // ── 1. Login via API ──────────────────────────────────────────────────
    await loginViaApi(request, page, BREEDER_EMAIL, BREEDER_PASSWORD)

    const accessToken = await page.evaluate(() => window.localStorage.getItem('access_token'))
    expect(accessToken, 'access_token tem de estar em localStorage').toBeTruthy()

    // ── 2. Descobrir raca alvo ────────────────────────────────────────────
    const breedsRes = await request.get(`${API_BASE_URL}/breeds`)
    expect(breedsRes.ok(), 'GET /breeds tem de responder 200').toBe(true)
    const breedsBody = (await breedsRes.json()) as
      | BreedListItem[]
      | { breeds?: BreedListItem[]; data?: BreedListItem[] }
    const breeds: BreedListItem[] = Array.isArray(breedsBody)
      ? breedsBody
      : (breedsBody.breeds ?? breedsBody.data ?? [])
    expect(breeds.length).toBeGreaterThan(0)

    const mineRes = await request.get(`${API_BASE_URL}/payments/sponsored-slot/mine`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const mineBody = mineRes.ok()
      ? ((await mineRes.json()) as { data: MySlot[] })
      : { data: [] as MySlot[] }
    const breedsAlreadyOwned = new Set(mineBody.data.map((s) => s.breedId))

    let targetBreed: BreedListItem | null = null
    let availability: AvailabilityResponse | null = null
    for (const breed of breeds.slice(0, 30)) {
      if (breedsAlreadyOwned.has(breed.id)) continue
      const availRes = await request.get(
        `${API_BASE_URL}/payments/sponsored-slot/availability?breedId=${breed.id}`,
      )
      if (!availRes.ok()) continue
      const avail = (await availRes.json()) as AvailabilityResponse
      if (avail.available > 0) {
        targetBreed = breed
        availability = avail
        break
      }
    }
    expect(
      targetBreed,
      'Tem de existir pelo menos uma raca com vaga e sem slot pre-existente do criador',
    ).not.toBeNull()
    expect(availability!.priceCents).toBe(1000)
    expect(availability!.currency).toBe('EUR')
    // eslint-disable-next-line no-console
    console.log(
      `[E2E] Raca alvo: ${targetBreed!.namePt} (id=${targetBreed!.id}), ` +
        `${availability!.available}/${availability!.maxSlots} disponiveis`,
    )

    // ── 3. Navegar Dashboard > Destaque ───────────────────────────────────
    await page.goto('/area-pessoal?tab=destaque')
    const destaqueTab = page.getByRole('tab', { name: /Destaque/i })
    await expect(destaqueTab).toBeVisible({ timeout: 15_000 })
    await destaqueTab.click()
    await expect(page.getByRole('button', { name: /Comprar destaque/i })).toBeVisible({
      timeout: 15_000,
    })

    // ── 4. Modal + escolher raca ──────────────────────────────────────────
    await page.getByRole('button', { name: /Comprar destaque/i }).click()
    const modal = page.getByRole('dialog', { name: /Comprar destaque/i })
    await expect(modal).toBeVisible()
    await expect(modal.getByText(/10,00\s*€\s*por\s*30\s*dias/i)).toBeVisible()
    await modal.getByLabel('Raça').selectOption(String(targetBreed!.id))
    // Esperar que /availability resolva e renderize o texto de vagas. Pode
    // demorar um pouco em stage por causa de RTT alto. Aceitamos qualquer
    // forma do texto (com ou sem acentos, com numero ou nao).
    await expect(modal.getByText(/vagas disponiveis|vagas disponíveis/i)).toBeVisible({
      timeout: 20_000,
    })

    // ── 5. Avancar para Stripe ────────────────────────────────────────────
    // IMPORTANTE: Stripe Checkout faz long-polling permanente (telemetria +
    // payment-method updates) e nunca dispara o evento "load" do browser.
    // Por defeito waitForURL espera por "load", o que faz timeout aqui apesar
    // da navegacao ja ter ocorrido. Usamos `waitUntil: 'domcontentloaded'`
    // que e' suficiente — a HTML inicial ja contem o produto/preco/email.
    const stripeNavigationPromise = page.waitForURL(/checkout\.stripe\.com/, {
      timeout: STRIPE_TIMEOUT,
      waitUntil: 'domcontentloaded',
    })
    await modal
      .getByRole('button', { name: /Avancar para pagamento|Avançar para pagamento/i })
      .click()
    await stripeNavigationPromise
    // eslint-disable-next-line no-console
    console.log('[E2E] Redireccionado para Stripe Checkout:', page.url())

    // Asserir conteudo da pagina Stripe (sem preencher form).
    // Usamos `domcontentloaded` em vez de `networkidle` porque o Stripe
    // mantem long-polling permanente (telemetria + payment method updates).
    await page.waitForLoadState('domcontentloaded', { timeout: STRIPE_TIMEOUT })

    // O nome do produto e' "Destaque no Simulador — <nome raca>".
    // Pode aparecer fragmentado no DOM por Stripe usar varios spans, por
    // isso fazemos polling com pollFn em vez de getByText estrito.
    await expect
      .poll(async () => (await page.content()).includes(targetBreed!.namePt), {
        timeout: STRIPE_TIMEOUT,
        message: `Nome da raca "${targetBreed!.namePt}" tem de aparecer na pagina Stripe`,
      })
      .toBe(true)

    await expect
      .poll(async () => /10[,.]00/.test(await page.content()), {
        timeout: STRIPE_TIMEOUT,
        message: 'Preco 10,00 tem de aparecer na pagina Stripe',
      })
      .toBe(true)

    await expect
      .poll(async () => (await page.content()).includes(BREEDER_EMAIL), {
        timeout: STRIPE_TIMEOUT,
        message: `Email ${BREEDER_EMAIL} tem de aparecer pre-preenchido na pagina Stripe`,
      })
      .toBe(true)

    // ── 6. Cleanup: apagar slot PENDING criado ────────────────────────────
    // Buscar slot via /mine (esta agora PAUSED+PENDING ate' o webhook
    // confirmar). Apagamos via DELETE admin.
    const afterRes = await request.get(`${API_BASE_URL}/payments/sponsored-slot/mine`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (afterRes.ok()) {
      const afterBody = (await afterRes.json()) as { data: MySlot[] }
      const newSlot = afterBody.data.find(
        (s) => s.breedId === targetBreed!.id && s.paymentStatus === 'PENDING',
      )
      if (newSlot) {
        const adminLogin = await request.post(`${API_BASE_URL}/auth/login`, {
          data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
        })
        if (adminLogin.ok()) {
          const adminBody = (await adminLogin.json()) as { accessToken: string }
          const del = await request.delete(`${API_BASE_URL}/admin/sponsored-slots/${newSlot.id}`, {
            headers: { Authorization: `Bearer ${adminBody.accessToken}` },
          })
          // eslint-disable-next-line no-console
          console.log(
            `[E2E] Cleanup slot ${newSlot.id} -> ${del.status()} ${del.ok() ? 'OK' : 'FAILED'}`,
          )
        } else {
          // eslint-disable-next-line no-console
          console.warn('[E2E] Cleanup skipped: admin login falhou')
        }
      }
    }
  })
})
