/**
 * Painel de administração (/admin) — @prod-safe (read-only).
 *
 * O módulo admin não tinha NENHUM teste E2E nem unitário. É a superfície de
 * maior risco do produto: um bypass de autorização aqui expõe dados de todos
 * os utilizadores. Estes testes cobrem o gate de role (UI + API) e a
 * integridade do painel em si.
 */

import { test, expect } from '../fixtures/test'
import { loginViaApi, dismissConsentBanner } from '../fixtures/auth'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API_BASE_URL,
  DEMO_CLIENT_EMAILS,
  DEMO_PASSWORD,
} from '../fixtures/demo-data'
import { seedSkipReason } from '../fixtures/env'

/**
 * Labels dos tabs do painel (ver `tabs` em pages/admin/AdminPage.tsx).
 * O badge acrescenta "(N)" ao nome acessível, por isso casamos por prefixo.
 */
const ADMIN_TABS = [
  'Resumo',
  'Verificações',
  'Utilizadores',
  'Criadores',
  'Serviços',
  'Moderação',
  'Patrocinados',
  'Auditoria',
] as const

test.describe('Painel de administração @prod-safe', () => {
  test('admin vê o painel e todas as secções', async ({ page, caps }) => {
    test.skip(!caps.hasAdmin, seedSkipReason(caps, 'conta de administrador'))
    await dismissConsentBanner(page)

    await loginViaApi(page.context().request, page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto('/admin')

    await expect(
      page.getByRole('heading', { name: /Painel de administração/i, level: 1 }),
    ).toBeVisible({ timeout: 25_000 })

    for (const label of ADMIN_TABS) {
      await expect(
        page.getByRole('tab', { name: new RegExp(`^${label}`) }).first(),
        `secção '${label}' em falta no painel admin`,
      ).toBeVisible({ timeout: 15_000 })
    }
  })

  test('admin consegue abrir cada secção sem erro', async ({ page, caps }) => {
    test.skip(!caps.hasAdmin, seedSkipReason(caps, 'conta de administrador'))
    await dismissConsentBanner(page)

    await loginViaApi(page.context().request, page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /Painel de administração/i })).toBeVisible({
      timeout: 25_000,
    })

    // Percorrer todas as secções: apanha erreurs de render (listas vazias,
    // campos em falta) que só aparecem quando o tab monta.
    for (const label of ADMIN_TABS) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${label}`) }).first()
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
    }
  })

  test('utilizador comum é empurrado para fora de /admin', async ({ page, caps }) => {
    test.skip(!caps.hasDemoClient, seedSkipReason(caps, 'utilizadores demo (cliente)'))
    await dismissConsentBanner(page)

    const { user } = await loginViaApi(page.context().request, page, DEMO_CLIENT_EMAILS[0]!)
    expect((user as { role?: string }).role).not.toBe('ADMIN')

    await page.goto('/admin')

    // ProtectedRoute roles=['ADMIN'] → Navigate para '/'.
    await expect(page).toHaveURL(/\/$/, { timeout: 25_000 })
    await expect(page.getByRole('heading', { name: /Painel de administração/i })).toBeHidden()
  })

  test('/admin/utilizadores/:id e /admin/criadores/:id também estão protegidos', async ({
    page,
    caps,
  }) => {
    test.skip(!caps.hasDemoClient, seedSkipReason(caps, 'utilizadores demo (cliente)'))
    await dismissConsentBanner(page)

    await loginViaApi(page.context().request, page, DEMO_CLIENT_EMAILS[1]!)

    for (const path of ['/admin/utilizadores/1', '/admin/criadores/1']) {
      await page.goto(path)
      await expect(page, `${path} não devia ser acessível a não-admin`).toHaveURL(/\/$/, {
        timeout: 25_000,
      })
    }
  })

  test('sem sessão, /admin redireciona para /entrar', async ({ page }) => {
    await dismissConsentBanner(page)

    await page.goto('/admin')

    // ProtectedRoute sem auth → Navigate para '/entrar' (ver
    // components/shared/ProtectedRoute.tsx).
    await expect(page).toHaveURL(/\/entrar/, { timeout: 25_000 })
    await expect(page.getByRole('heading', { name: /Painel de administração/i })).toBeHidden()
  })

  test('robots.txt exclui /admin da pesquisa', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.ok(), `robots.txt devolveu ${res.status()}`).toBe(true)
    const body = await res.text()
    expect(body, 'robots.txt devia excluir /admin').toContain('Disallow: /admin')
  })

  test('admin: pesquisa sem resultados mostra empty state em pt-PT', async ({ page, caps }) => {
    test.skip(!caps.hasAdmin, seedSkipReason(caps, 'conta de administrador'))
    await dismissConsentBanner(page)

    await loginViaApi(page.context().request, page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto('/admin?tab=utilizadores')
    await expect(
      page.getByRole('heading', { name: /Painel de administração/i, level: 1 }),
    ).toBeVisible({ timeout: 25_000 })

    // Forçar lista vazia com uma pesquisa que não casa com ninguém.
    await page.fill('#user-search', 'zzz-sem-resultados-zzz')
    await expect(page.getByRole('heading', { name: 'Sem utilizadores' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Nenhum utilizador encontrado.')).toBeVisible()
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
  })

  test('admin: deep-link de utilizador obtido da lista abre o detalhe', async ({ page, caps }) => {
    test.skip(!caps.hasAdmin, seedSkipReason(caps, 'conta de administrador'))
    await dismissConsentBanner(page)

    await loginViaApi(page.context().request, page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto('/admin?tab=utilizadores')
    await expect(
      page.getByRole('heading', { name: /Painel de administração/i, level: 1 }),
    ).toBeVisible({ timeout: 25_000 })

    // Id obtido da própria lista — nunca hardcoded (em produção os ids de
    // seed não existem).
    const link = page.locator('a[href^="/admin/utilizadores/"]').first()
    await expect(link).toBeVisible({ timeout: 15_000 })
    const href = await link.getAttribute('href')
    expect(href, 'lista devia ter links para o detalhe').toMatch(/^\/admin\/utilizadores\/.+/)

    await page.goto(href!)
    await expect(page).toHaveURL(/\/admin\/utilizadores\/.+/, { timeout: 25_000 })
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
    // Detalhe mostra o caminho de volta à lista (h1 = nome do utilizador).
    await expect(page.getByRole('link', { name: /Voltar à lista/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('endpoints /api/admin/* exigem token de administrador', async ({ request, caps }) => {
    // Sem token
    const anon = await request.get(`${API_BASE_URL}/admin/users`)
    expect([401, 403], 'endpoint admin respondeu a um pedido anónimo').toContain(anon.status())

    // Token inválido
    const bogus = await request.get(`${API_BASE_URL}/admin/users`, {
      headers: { Authorization: 'Bearer token-invalido' },
    })
    expect([401, 403]).toContain(bogus.status())

    // Token válido mas de role não-admin
    if (caps.hasDemoClient) {
      const login = await request.post(`${API_BASE_URL}/auth/login`, {
        data: { email: DEMO_CLIENT_EMAILS[0], password: DEMO_PASSWORD },
      })
      if (login.ok()) {
        const { accessToken } = (await login.json()) as { accessToken: string }
        const res = await request.get(`${API_BASE_URL}/admin/users`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        expect([401, 403], 'um utilizador comum recebeu 200 num endpoint de admin').toContain(
          res.status(),
        )
      }
    }
  })
})
