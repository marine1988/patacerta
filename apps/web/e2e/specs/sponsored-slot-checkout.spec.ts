/**
 * E2E completo do fluxo de compra de Sponsored Slot.
 *
 * Fluxo coberto:
 *  1. Login programatico via API como criador.
 *  2. Descobrir uma raca com slot disponivel via /api/payments/sponsored-slot/availability.
 *  3. Navegar para Dashboard > Destaque, abrir modal de compra.
 *  4. Seleccionar raca e clicar "Avancar para pagamento".
 *  5. Asserir redirect para checkout.stripe.com.
 *  6. Preencher formulario Stripe Checkout com cartao de teste 4242...
 *  7. Submeter pagamento.
 *  8. Asserir redirect de volta para /area-pessoal?tab=destaque&checkout=success.
 *  9. Asserir que o slot aparece como activo no Dashboard (apos webhook ter
 *     processado o evento checkout.session.completed).
 *
 * Pre-requisitos para correr este teste:
 *  - Stage configurado com chaves Stripe (test mode) e webhook activo.
 *  - Variaveis de ambiente:
 *      E2E_BASE_URL=https://stage.patacerta.pt
 *      E2E_API_URL=https://stage.patacerta.pt/api
 *      E2E_BREEDER_EMAIL=criador@criador.pt
 *      E2E_BREEDER_PASSWORD=Teste123$
 *  - O criador tem de estar VERIFIED/ACTIVE no admin.
 *  - Multibanco/MB Way activos em https://dashboard.stripe.com/test/settings/payment_methods
 *    (nao bloqueia o teste mas reflecte o comportamento real).
 *
 * Limitacoes conhecidas:
 *  - A UI hospedada do Stripe Checkout muda sem aviso (A/B testing). Os
 *    selectors podem ficar desactualizados. Se este teste comecar a falhar
 *    nesses passos, a alternativa robusta e' usar a API da Stripe directamente
 *    para simular a sessao paga (ver TODO no fim do ficheiro).
 *  - O webhook e' assincrono. Apos redirect, fazemos polling da API por ate
 *    20 segundos a' espera de o slot ficar PAID.
 *  - O teste depende de haver pelo menos uma raca com slot disponivel. Se as
 *    104 racas estiverem todas com 3 slots cada, o teste falha — mas esse
 *    cenario e' irrealista em stage.
 */
import { test, expect } from '@playwright/test'
import { loginViaApi } from '../fixtures/auth'
import { API_BASE_URL } from '../fixtures/demo-data'

// Credenciais especificas deste teste (criador real em stage com perfil
// completo). Permitimos override via env para nao hardcodar em CI.
const BREEDER_EMAIL = process.env.E2E_BREEDER_EMAIL || 'criador@criador.pt'
const BREEDER_PASSWORD = process.env.E2E_BREEDER_PASSWORD || 'Teste123$'

// Cartao de teste oficial da Stripe (sempre aprovado em test mode).
const TEST_CARD = {
  number: '4242 4242 4242 4242',
  expiry: '12 / 30',
  cvc: '123',
  postal: '1000-001',
}

// Configuracoes de timeout — Stripe Checkout pode demorar a carregar.
const STRIPE_TIMEOUT = 60_000
const WEBHOOK_TIMEOUT = 30_000

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

test.describe('Sponsored Slot — checkout completo', () => {
  test.skip(
    !!process.env.E2E_SKIP_DESTRUCTIVE,
    'Destrutivo: cria pagamento real (test mode) na conta Stripe.',
  )

  test('criador compra slot, paga com cartao de teste, slot fica activo', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000) // 3 minutos — Stripe Checkout e webhook somam.

    // ── 1. Login via API ──────────────────────────────────────────────────
    await loginViaApi(request, page, BREEDER_EMAIL, BREEDER_PASSWORD)

    // ── 2. Descobrir uma raca com slot disponivel ─────────────────────────
    // Buscamos a lista de racas e iteramos ate' encontrar uma com available>0
    // E onde o proprio criador ainda nao tenha slot (PENDING/ACTIVE/PAUSED).
    // O backend bloqueia novo checkout com 409 DUPLICATE_SLOT se ja' existir.
    const breedsRes = await request.get(`${API_BASE_URL}/breeds`)
    expect(breedsRes.ok(), 'GET /breeds tem de responder 200').toBe(true)
    // A API devolve um array directo (nao envelope). Mantemos compatibilidade
    // futura aceitando { breeds: [...] } ou { data: [...] } caso evolua.
    const breedsBody = (await breedsRes.json()) as
      | BreedListItem[]
      | { breeds?: BreedListItem[]; data?: BreedListItem[] }
    const breeds: BreedListItem[] = Array.isArray(breedsBody)
      ? breedsBody
      : (breedsBody.breeds ?? breedsBody.data ?? [])
    expect(breeds.length, 'API tem de devolver pelo menos uma raca seedada').toBeGreaterThan(0)

    // Buscar slots existentes do criador para nao tentar comprar de novo na
    // mesma raca (gera 409 DUPLICATE_SLOT). Precisamos do access token para
    // este endpoint autenticado — extraido do localStorage injectado pelo
    // loginViaApi.
    const accessTokenForLookup = await page.evaluate(() =>
      window.localStorage.getItem('access_token'),
    )
    expect(
      accessTokenForLookup,
      'access_token tem de estar em localStorage apos login',
    ).toBeTruthy()
    const mineRes = await request.get(`${API_BASE_URL}/payments/sponsored-slot/mine`, {
      headers: { Authorization: `Bearer ${accessTokenForLookup}` },
    })
    const mineBody = mineRes.ok()
      ? ((await mineRes.json()) as { data: Array<{ breedId: number }> })
      : { data: [] }
    const breedsAlreadyOwned = new Set(mineBody.data.map((s) => s.breedId))

    let targetBreed: BreedListItem | null = null
    let availability: AvailabilityResponse | null = null
    // Tentar ate' 20 racas (em vez de 10) para acomodar acumulacao de PENDING
    // de execucoes anteriores em stage.
    for (const breed of breeds.slice(0, 20)) {
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
      'Tem de existir pelo menos uma raca com slot disponivel e sem slot pre-existente do criador',
    ).not.toBeNull()
    expect(availability!.priceCents).toBe(1000)
    expect(availability!.currency).toBe('EUR')
    console.log(
      `[E2E] Raca alvo: ${targetBreed!.namePt} (id=${targetBreed!.id}), ` +
        `${availability!.available}/${availability!.maxSlots} disponiveis`,
    )

    // ── 3. Navegar para Dashboard > Destaque ──────────────────────────────
    await page.goto('/area-pessoal?tab=destaque')
    // O tab "Destaque" so existe para criadores VERIFIED. Esperamos que o
    // tab apareca (depende de /breeders/me/profile resolver com status
    // VERIFIED) e clicamos explicitamente — o defaultTab da pagina pode
    // resolver para "profile" se o probe ainda nao retornou no momento da
    // primeira render.
    const destaqueTab = page.getByRole('tab', { name: /Destaque/i })
    await expect(destaqueTab).toBeVisible({ timeout: 15_000 })
    await destaqueTab.click()
    await expect(page.getByRole('button', { name: /Comprar destaque/i })).toBeVisible({
      timeout: 15_000,
    })

    // ── 4. Abrir modal e seleccionar raca ─────────────────────────────────
    await page.getByRole('button', { name: /Comprar destaque/i }).click()

    // O modal usa Modal partilhado com title="Comprar destaque" — h2/dialog
    // role esta presente. Usamos `name` (= aria-labelledby) para distinguir
    // do banner de cookies que tambem e' um role=dialog.
    const modal = page.getByRole('dialog', { name: /Comprar destaque/i })
    await expect(modal).toBeVisible()
    await expect(modal.getByText(/10,00\s*€\s*por\s*30\s*dias/i)).toBeVisible()

    // O Select tem label "Raça" e options preenchidas via prop. O componente
    // e' um <select> nativo (ver components/ui/Select.tsx), por isso usamos
    // selectOption.
    await modal.getByLabel('Raça').selectOption(String(targetBreed!.id))

    // Esperar info de disponibilidade carregar.
    await expect(modal.getByText(/disponiveis|disponíveis/i)).toBeVisible({ timeout: 10_000 })

    // ── 5. Avancar para Stripe ────────────────────────────────────────────
    // O click vai disparar uma mutation que faz POST a /api/payments/sponsored-slot
    // e devolve session.url; o frontend faz window.location.href = url.
    // Aguardamos a navegacao para checkout.stripe.com.
    const stripeNavigationPromise = page.waitForURL(/checkout\.stripe\.com/, {
      timeout: STRIPE_TIMEOUT,
    })
    await modal
      .getByRole('button', { name: /Avancar para pagamento|Avançar para pagamento/i })
      .click()
    await stripeNavigationPromise

    console.log('[E2E] Redireccionado para Stripe Checkout:', page.url())

    // ── 6. Preencher formulario Stripe Checkout ───────────────────────────
    // A UI da Stripe usa labels EN ("Card number", "Expiration", "CVC",
    // "Country or region", "ZIP / Postal code"). Tem A/B testing — se
    // falhar ao encontrar um label, pode ter mudado. Os selectors abaixo
    // sao os mais estaveis em test mode (Maio 2026).

    // Esperar a pagina renderizar completamente.
    await page.waitForLoadState('networkidle', { timeout: STRIPE_TIMEOUT })

    // Campo cartao — pode estar em iframe ou inline. Tentamos label primeiro.
    const cardNumberField = page.getByLabel(/Card number|Número do cartão/i).first()
    await cardNumberField.waitFor({ state: 'visible', timeout: STRIPE_TIMEOUT })
    await cardNumberField.fill(TEST_CARD.number)

    await page
      .getByLabel(/Expiration|Validade/i)
      .first()
      .fill(TEST_CARD.expiry)
    await page
      .getByLabel(/CVC|CVV/i)
      .first()
      .fill(TEST_CARD.cvc)

    // Nome no cartao (opcional dependendo do pais detectado).
    const nameField = page.getByLabel(/Cardholder name|Nome no cartão/i).first()
    if (await nameField.isVisible().catch(() => false)) {
      await nameField.fill('Criador Teste')
    }

    // Codigo postal (Portugal — formato XXXX-XXX).
    const postalField = page.getByLabel(/Postal code|ZIP|Código postal/i).first()
    if (await postalField.isVisible().catch(() => false)) {
      await postalField.fill(TEST_CARD.postal)
    }

    // ── 7. Submeter pagamento ─────────────────────────────────────────────
    // Esperamos navegacao de volta ao success_url do nosso frontend.
    const successNavigationPromise = page.waitForURL(/\/area-pessoal\?.*checkout=success/, {
      timeout: STRIPE_TIMEOUT,
    })

    // O botao submit tem texto dinamico — pode ser "Pay €10.00" ou "Pagar €10,00".
    await page.getByRole('button', { name: /^(Pay|Pagar)\s.*10[,.]00/i }).click()

    await successNavigationPromise
    console.log('[E2E] Redireccionado de volta para frontend:', page.url())

    // ── 8. Asserir confirmacao no Dashboard ───────────────────────────────
    // O frontend pode ler ?checkout=success da URL para mostrar mensagem.
    // Independente disso, fazemos polling ao endpoint listMySponsoredSlots
    // para confirmar que o webhook activou o slot. O webhook e' best-effort
    // assincrono — pode demorar alguns segundos.
    const accessToken = await page.evaluate(() => window.localStorage.getItem('access_token'))
    expect(accessToken, 'accessToken tem de estar presente apos redirect').toBeTruthy()

    let slotIsActive = false
    const pollStart = Date.now()
    while (Date.now() - pollStart < WEBHOOK_TIMEOUT) {
      const slotsRes = await request.get(`${API_BASE_URL}/payments/sponsored-slot/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (slotsRes.ok()) {
        const slotsBody = (await slotsRes.json()) as {
          data: Array<{
            breedId: number
            status: string
            paymentStatus: string
          }>
        }
        const matching = slotsBody.data.find((s) => s.breedId === targetBreed!.id)
        if (matching && matching.status === 'ACTIVE' && matching.paymentStatus === 'PAID') {
          slotIsActive = true
          break
        }
      }
      await page.waitForTimeout(2_000)
    }
    expect(
      slotIsActive,
      `Slot da raca ${targetBreed!.namePt} tinha de ficar ACTIVE+PAID em ${WEBHOOK_TIMEOUT}ms apos pagamento`,
    ).toBe(true)

    console.log(`[E2E] Slot activo confirmado para raca ${targetBreed!.namePt}.`)
  })
})

/**
 * TODO (futuro):
 *
 * Para tornar este teste estavel em CI, considerar refactor para:
 *   1. Asserir que /api/payments/sponsored-slot devolve session.url valido
 *      (sem clicar no link).
 *   2. Usar a Stripe Node SDK com STRIPE_SECRET_KEY (test mode) para chamar
 *      stripe.checkout.sessions.expire() ou simular conclusao via test
 *      helpers (https://stripe.com/docs/testing/checkout).
 *   3. Disparar o webhook localmente com payload assinado usando
 *      stripe.webhooks.generateTestHeaderString().
 *
 * Esse approach evita a UI hospedada da Stripe (instavel) e cobre 100% do
 * nosso codigo (controller + webhook). E' o pattern recomendado para suites
 * de regressao.
 */
