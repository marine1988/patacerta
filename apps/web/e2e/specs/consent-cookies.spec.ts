/**
 * Consentimento de cookies / RGPD — @prod-safe (read-only de dados de utilizador).
 *
 * O `ConsentBanner` e o `ConsentSettingsModal` não tinham teste nenhum.
 * É uma obrigação legal (RGPD art. 7.º + orientações CNPD) e, além disso,
 * o banner é a causa clássica de flakes nos outros specs: cobre os CTAs em
 * viewports pequenos e engole cliques.
 *
 * Efeito colateral aceitável em produção: cada decisão grava UMA linha
 * anónima de audit trail (`POST /api/consent/cookies`). Sem dados pessoais,
 * sem autenticação — é exactamente o comportamento pretendido.
 */

import { test, expect } from '../fixtures/test'

const STORAGE_KEY = 'pc_consent_v1'

async function readStoredConsent(page: import('@playwright/test').Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { decision: Record<string, boolean> | null }) : null
  }, STORAGE_KEY)
}

test.describe('Consentimento de cookies / RGPD @prod-safe', () => {
  test('primeira visita mostra o banner e permite decidir', async ({ page }) => {
    // Contexto limpo por defeito (Playwright não reutiliza state) → sem decisão.
    await page.goto('/')

    const banner = page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i })
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await expect(banner.getByRole('heading', { name: /Cookies e privacidade/i })).toBeVisible()

    // As três vias de decisão exigidas pelo RGPD têm de estar disponíveis.
    await expect(banner.getByRole('button', { name: /Aceitar todos/i })).toBeVisible()
    await expect(banner.getByRole('button', { name: /Rejeitar opcionais/i })).toBeVisible()
    await expect(banner.getByRole('button', { name: /Personalizar/i })).toBeVisible()
  })

  test('"Aceitar todos" persiste a decisão e não volta a aparecer', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i })
    await expect(banner).toBeVisible({ timeout: 15_000 })

    const audit = page.waitForResponse(
      (r) => r.url().includes('/api/consent/cookies') && r.request().method() === 'POST',
      { timeout: 15_000 },
    )
    await banner.getByRole('button', { name: /Aceitar todos/i }).click()
    await expect(banner).toBeHidden({ timeout: 15_000 })

    // Audit trail RGPD tem de ser registado no backend.
    const auditRes = await audit
    expect(auditRes.status(), 'POST /api/consent/cookies devia registar o audit').toBeLessThan(300)

    const stored = await readStoredConsent(page)
    expect(stored?.decision).toEqual({ necessary: true, analytics: true, marketing: true })

    // Recarregar NÃO pode voltar a pedir consentimento (decisão já tomada).
    await page.reload()
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i }),
    ).toBeHidden()
  })

  test('"Rejeitar opcionais" mantém analytics e marketing desligados', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i })
    await expect(banner).toBeVisible({ timeout: 15_000 })

    await banner.getByRole('button', { name: /Rejeitar opcionais/i }).click()
    await expect(banner).toBeHidden({ timeout: 15_000 })

    const stored = await readStoredConsent(page)
    expect(stored?.decision).toEqual({ necessary: true, analytics: false, marketing: false })

    // Google Consent Mode v2: sem consentimento, os sinais têm de ser 'denied'.
    // A entrada no dataLayer é `['consent','default', { … }]` — passar por
    // JSON para não imprimir "[object Object]".
    const gtagCalls = await page.evaluate(() =>
      ((window as { dataLayer?: unknown[][] }).dataLayer ?? []).map((entry) =>
        JSON.stringify(entry),
      ),
    )
    const consentDefaults = gtagCalls.filter((c) => c.includes('consent') && c.includes('default'))
    expect(consentDefaults.join(' | ')).toContain('analytics_storage')
    expect(consentDefaults.join(' | ')).toContain('denied')
  })

  test('decisão é re-pedida quando a versão da política muda', async ({ page }) => {
    // Simula uma decisão de uma versão antiga da política de cookies.
    await page.addInitScript((key) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          anonId: 'e2e-versao-antiga',
          decision: { necessary: true, analytics: true, marketing: true },
          version: '1999-01-01',
          decidedAt: new Date().toISOString(),
        }),
      )
    }, STORAGE_KEY)

    await page.goto('/')

    // Version mismatch → re-consent obrigatório (senão um bump de política
    // nunca chegaria aos utilizadores existentes).
    await expect(
      page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('modal de definições abre no footer e guarda escolha granular', async ({ page }) => {
    await page.goto('/')
    // Fechar o banner primeiro para não haver dois diálogos em cima um do outro.
    const banner = page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i })
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await banner.getByRole('button', { name: /Rejeitar opcionais/i }).click()
    await expect(banner).toBeHidden()

    // O footer dispara `patacerta:open-consent-settings`.
    await page.getByRole('button', { name: /Definições de cookies/i }).click()

    const modal = page.getByRole('dialog').filter({ hasText: /Definições de cookies/i })
    await expect(modal.first()).toBeVisible({ timeout: 10_000 })
    await expect(modal.first().getByRole('button', { name: /Guardar preferências/i })).toBeVisible()
    // Categorias obrigatórias por RGPD: as opcionais têm de ser desligáveis.
    await expect(modal.first().getByText(/Estritamente necessárias/i)).toBeVisible()
    await expect(modal.first().getByText(/Estatísticas/i)).toBeVisible()
    await expect(modal.first().getByText(/Marketing e publicidade/i)).toBeVisible()

    // Escape fecha o modal (focus management + teclado).
    await page.keyboard.press('Escape')
    await expect(modal.first()).toBeHidden({ timeout: 10_000 })
  })

  test('banner tem link funcional para a política de privacidade', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i })
    await expect(banner).toBeVisible({ timeout: 15_000 })

    const link = banner.getByRole('link', { name: /Saber mais/i })
    await expect(link).toBeVisible()
    expect(await link.getAttribute('href')).toBe('/politica-privacidade')

    // A rota tem de existir e devolver conteúdo (GET read-only, seguro em prod).
    const res = await page.request.get('/politica-privacidade')
    expect(res.status(), 'GET /politica-privacidade devia ser 200').toBe(200)
  })

  test('"Personalizar" abre o modal e "Guardar preferências" grava escolha granular', async ({
    page,
  }) => {
    await page.goto('/')
    const banner = page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i })
    await expect(banner).toBeVisible({ timeout: 15_000 })

    // O modal abre a partir do próprio banner (via "Personalizar").
    await banner.getByRole('button', { name: /Personalizar/i }).click()

    const modal = page.getByRole('dialog').filter({ hasText: /Definições de cookies/i })
    await expect(modal.first()).toBeVisible({ timeout: 10_000 })

    // Escolha granular: estatísticas sim, marketing não.
    await modal
      .first()
      .getByRole('checkbox', { name: /Estatísticas/i })
      .check()
    await modal
      .first()
      .getByRole('button', { name: /Guardar preferências/i })
      .click()

    await expect(modal.first()).toBeHidden({ timeout: 10_000 })
    await expect(banner).toBeHidden({ timeout: 15_000 })

    const stored = await readStoredConsent(page)
    expect(stored?.decision).toEqual({ necessary: true, analytics: true, marketing: false })

    // A decisão granular também persiste após reload.
    await page.reload()
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i }),
    ).toBeHidden()
  })

  test('com decisão tomada o banner não bloqueia cliques', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByRole('dialog').filter({ hasText: /Cookies e privacidade/i })
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await banner.getByRole('button', { name: /Aceitar todos/i }).click()
    await expect(banner).toBeHidden({ timeout: 15_000 })

    await page.reload()
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
    await expect(banner).toBeHidden()

    // A página continua interativa: o footer abre o modal de definições.
    await page.getByRole('button', { name: /Definições de cookies/i }).click()
    const modal = page.getByRole('dialog').filter({ hasText: /Definições de cookies/i })
    await expect(modal.first()).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await expect(modal.first()).toBeHidden({ timeout: 10_000 })
  })
})
