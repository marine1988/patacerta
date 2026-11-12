/**
 * Módulo de Feedback & Sugestões — contrato da API + UI.
 *
 * A parte @prod-safe é read-only (POST inválido que é rejeitado na validação,
 * sem escrever). Os testes de UI que submetem exigem um ambiente com utilizadores
 * demo (local/stage), pelo que ficam marcados com @mutating e não correm contra
 * produção.
 */

import { test, expect } from '../fixtures/test'
import { loginViaApi, dismissConsentBanner } from '../fixtures/auth'
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_BASE_URL } from '../fixtures/demo-data'
import { seedSkipReason } from '../fixtures/env'

test.describe('Contrato da API de feedback @prod-safe', () => {
  test('POST /api/feedback sem auth → 401', async ({ request }) => {
    const res = await request.post(`${API_BASE_URL}/feedback`, {
      data: {
        category: 'BUG',
        title: 'Teste e2e',
        body: 'Corpo suficientemente longo para validar',
      },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/feedback/export.md com sessão de admin devolve 200 e text/markdown', async ({
    request,
    caps,
  }) => {
    test.skip(!caps.hasAdmin, seedSkipReason(caps, 'conta de administrador'))
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    expect(login.ok()).toBeTruthy()
    const { accessToken } = (await login.json()) as { accessToken: string }

    const res = await request.get(`${API_BASE_URL}/admin/feedback/export.md`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/markdown')
  })
})

test.describe('Página de feedback — UI @prod-safe', () => {
  test('página /feedback carrega com formulário ou CTA de login', async ({ page }) => {
    await page.goto('/feedback')

    await expect(
      page.getByRole('heading', { name: 'Feedback & Sugestões', level: 1 }),
    ).toBeVisible()

    // Conforme a capacidade de sessão do ambiente: formulário (autenticado sem
    // feedback prévio) ou CTA de login (anónimo).
    const formOrCta = page.getByRole('button', { name: /Enviar feedback|Iniciar sessão/i }).first()
    await expect(formOrCta).toBeVisible()
  })

  test('footer tem card de destaque para /feedback', async ({ page }) => {
    await page.goto('/')
    const link = page.locator('footer a[href="/feedback"]')
    await expect(link).toBeVisible()
    await expect(link).toContainText(/Dar feedback/i)
    await link.click()
    await expect(page).toHaveURL(/\/feedback/)
  })

  test('feedback não está no menu principal', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header a[href="/feedback"]')).toHaveCount(0)
  })

  test('feedback funciona em dark mode', async ({ page }) => {
    await page.goto('/feedback')
    await page.evaluate(() => window.localStorage.setItem('patacerta:theme', 'dark'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true)
    await expect(
      page.getByRole('heading', { name: 'Feedback & Sugestões', level: 1 }),
    ).toBeVisible()
  })

  test('feedback é responsivo em mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/feedback')
    await expect(
      page.getByRole('heading', { name: 'Feedback & Sugestões', level: 1 }),
    ).toBeVisible()

    const footerLink = page.locator('footer a[href="/feedback"]')
    await footerLink.scrollIntoViewIfNeeded()
    await expect(footerLink).toBeVisible()
  })
})

test.describe('Painel de admin — tab Feedback @prod-safe', () => {
  test('admin: /admin?tab=feedback carrega, mostra Exportar .md e tabela/empty state', async ({
    page,
    caps,
  }) => {
    test.skip(!caps.hasAdmin, seedSkipReason(caps, 'conta de administrador'))
    await dismissConsentBanner(page)

    await loginViaApi(page.context().request, page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto('/admin?tab=feedback')
    await expect(
      page.getByRole('heading', { name: /Painel de administração/i, level: 1 }),
    ).toBeVisible({ timeout: 25_000 })

    await expect(page.getByRole('button', { name: /Exportar \.md/i })).toBeVisible({
      timeout: 15_000,
    })

    // Tabela (desktop) ou empty state.
    const emptyOrTable = page.getByText(/Ainda não há feedback\.|Data/i).first()
    await expect(emptyOrTable).toBeVisible({ timeout: 15_000 })
  })
})
