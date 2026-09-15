/**
 * Responsivo / mobile (390×844) — @prod-safe (read-only).
 *
 * Nada testava mobile, e o histórico recente do repo é precisamente de fixes
 * responsive nos serviços ("empilhar tag e preço em mobile", "manter preço no
 * topo em mobile", "impedir quebra do preço"). Sem cobertura, a próxima
 * alteração de layout volta a partir isto em silêncio.
 */

import { test, expect } from '../fixtures/test'
import { dismissConsentBanner } from '../fixtures/auth'
import { seedSkipReason } from '../fixtures/env'

// iPhone 12/13/14 — o viewport mais comum em Portugal segundo a analítica
// pública de dispositivos; cobre também o caso "mobile pequeno".
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

async function assertNoHorizontalOverflow(
  page: import('@playwright/test').Page,
  label: string,
): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth)
    return { scrollWidth, innerWidth: window.innerWidth }
  })
  expect(
    overflow.scrollWidth,
    `${label}: overflow horizontal (scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1)
}

test.describe('Responsivo mobile @prod-safe', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsentBanner(page)
  })

  test('navbar colapsa em hamburger e o menu abre/fecha', async ({ page }) => {
    await page.goto('/')

    const openMenu = page.getByRole('button', { name: /Abrir menu/i })
    await expect(openMenu).toBeVisible({ timeout: 20_000 })

    await openMenu.click()
    // O mesmo botão passa a "Fechar menu" (aria-label reflecte a acção).
    const closeMenu = page.getByRole('button', { name: /Fechar menu/i })
    await expect(closeMenu).toBeVisible()

    // Os destinos principais têm de estar alcançáveis no menu mobile.
    // Nota: o link do simulador não tem o texto "Simulador" (são dois spans
    // "Companheiro"/"ideal"), por isso seleccionamos pelo href — estável a
    // mudanças de copy.
    await expect(page.getByRole('link', { name: 'Pesquisar', exact: true }).first()).toBeVisible()
    // No menu mobile o link tem dois spans ("Companheiro"/"ideal") — o
    // textContent é "Companheiroideal". Há dois links com este href no DOM
    // (navbar desktop, escondido a 390px, + o do menu mobile) e ainda o CTA
    // do hero ("Começar simulador"), por isso filtramos por :visible + texto.
    await expect(
      page.locator('a[href="/simulador-raca"]:visible', { hasText: /companheiro/i }),
    ).toBeVisible()

    await closeMenu.click()
    await expect(page.getByRole('button', { name: /Abrir menu/i })).toBeVisible()
  })

  test('menu mobile navega para a pesquisa', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Abrir menu/i }).click()
    await page.getByRole('link', { name: 'Pesquisar', exact: true }).first().click()
    await expect(page).toHaveURL(/\/pesquisar/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  })

  for (const route of ['/', '/pesquisar', '/pesquisar?tipo=servicos', '/termos']) {
    test(`sem overflow horizontal em ${route}`, async ({ page }) => {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })
      await assertNoHorizontalOverflow(page, route)
    })
  }

  test('CTAs do hero estão visíveis e clicáveis em mobile', async ({ page }) => {
    await page.goto('/')

    const cta = page.getByRole('link', { name: /Pesquisar criadores/i }).first()
    await expect(cta).toBeVisible({ timeout: 20_000 })
    // Estar visível não chega: tem de estar dentro do viewport e receber o
    // clique (o banner de cookies já foi dispensado no beforeEach).
    const box = await cta.boundingBox()
    expect(box, 'CTA sem caixa de layout').toBeTruthy()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1)

    await cta.click()
    await expect(page).toHaveURL(/\/pesquisar/, { timeout: 20_000 })
  })

  test('tabs de pesquisa são utilizáveis em mobile', async ({ page }) => {
    await page.goto('/pesquisar')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })

    const servicos = page.getByRole('button', { name: 'Serviços', exact: true })
    await servicos.click()
    await expect(page).toHaveURL(/tipo=servicos/)
    await assertNoHorizontalOverflow(page, '/pesquisar (tab serviços)')
  })

  test('detalhe de serviço não quebra o layout em mobile', async ({ page, caps }) => {
    test.skip(!caps.hasServices, seedSkipReason(caps, 'serviços publicados'))

    await page.goto('/pesquisar?tipo=servicos')
    const firstService = page.locator('a[href^="/servicos/"]').first()
    await expect(firstService).toBeVisible({ timeout: 25_000 })
    await firstService.click()

    await expect(page).toHaveURL(/\/servicos\/[\w-]+/, { timeout: 25_000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 25_000 })
    await assertNoHorizontalOverflow(page, 'detalhe de serviço (mobile)')
  })

  test('controlos principais têm alvos de toque >= 40px em mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })

    const hamburger = page.getByRole('button', { name: /Abrir menu/i })
    await expect(hamburger).toBeVisible()
    const burgerBox = await hamburger.boundingBox()
    expect(burgerBox, 'hamburger sem caixa de layout').toBeTruthy()
    expect(
      burgerBox!.height,
      `hamburger com altura ${burgerBox!.height}px < 40px`,
    ).toBeGreaterThanOrEqual(40)

    const heroCta = page.getByRole('link', { name: /Pesquisar criadores/i }).first()
    await expect(heroCta).toBeVisible()
    const ctaBox = await heroCta.boundingBox()
    expect(ctaBox, 'CTA do hero sem caixa de layout').toBeTruthy()
    expect(
      ctaBox!.height,
      `CTA do hero com altura ${ctaBox!.height}px < 40px`,
    ).toBeGreaterThanOrEqual(40)

    await page.goto('/pesquisar')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
    const tab = page.getByRole('button', { name: 'Serviços', exact: true })
    await expect(tab).toBeVisible()
    const tabBox = await tab.boundingBox()
    expect(tabBox, 'tab Serviços sem caixa de layout').toBeTruthy()
    expect(
      tabBox!.height,
      `tab Serviços com altura ${tabBox!.height}px < 40px`,
    ).toBeGreaterThanOrEqual(40)
  })

  test('sem erros de consola ou exceções nas rotas mobile', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      // Ruído de ambiente, não da app: quando o balde de rate-limit do IP está
      // esgotado (apiRateLimit 200/15min) TODAS as chamadas da SPA devolvem 429
      // e o browser regista "Failed to load resource ... 429". Isso é o
      // ambiente a recusar servir, não uma regressão (ver PATA-BUG-3).
      if (/429|Too Many Requests|RATE_LIMITED/i.test(text)) return
      errors.push(text)
    })
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

    for (const route of ['/', '/pesquisar']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })
    }
    expect(errors, `erros de consola em mobile: ${errors.join(' | ')}`).toEqual([])
  })
})
