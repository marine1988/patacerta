/**
 * Painel autenticado (/area-pessoal) — @prod-safe (read-only).
 *
 * O dashboard é o coração da área pessoal (perfil, criador, serviços,
 * mensagens, avaliações, definições) e não tinha NENHUM teste E2E.
 *
 * O login é feito via API (`loginViaApi`) em vez do formulário: mais rápido,
 * menos sujeito a flakes e independente do layout da página de login (que já
 * tem cobertura própria em `auth.spec.ts`).
 *
 * Requer os utilizadores demo das seeds. Em ambientes sem seeds (produção)
 * os testes fazem skip com mensagem explícita em vez de dar falso negativo.
 */

import { test, expect } from '../fixtures/test'
import { loginViaApi, dismissConsentBanner } from '../fixtures/auth'
import { DEMO_CLIENT_EMAILS } from '../fixtures/demo-data'
import { seedSkipReason } from '../fixtures/env'

const CLIENT_EMAIL = DEMO_CLIENT_EMAILS[0]!

/** tabId do dashboard → label visível no tablist. */
const TABS = [
  { id: 'profile', label: 'Perfil' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'mensagens', label: 'Mensagens' },
  { id: 'definicoes', label: 'Definições' },
] as const

test.describe('Painel autenticado @prod-safe', () => {
  test.beforeEach(async ({ page, caps }) => {
    test.skip(!caps.hasDemoClient, seedSkipReason(caps, 'utilizadores demo (cliente)'))
    await dismissConsentBanner(page)
  })

  test('login abre a área pessoal com o nome do utilizador', async ({ page, request }) => {
    const { user } = await loginViaApi(request, page, CLIENT_EMAIL)

    await page.goto('/area-pessoal')

    await expect(page.getByRole('heading', { name: 'Área pessoal', level: 1 })).toBeVisible({
      timeout: 20_000,
    })
    // A navbar deixa de oferecer "Entrar" quando há sessão.
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeHidden()
    const firstName = (user as { firstName?: string })?.firstName
    expect(firstName, 'a resposta de /auth/login devia trazer o user').toBeTruthy()
    await expect(page.getByText(new RegExp(firstName!, 'i')).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('tabs principais estão disponíveis e navegáveis', async ({ page, request }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)
    await page.goto('/area-pessoal')

    for (const tab of TABS) {
      await expect(
        page.getByRole('tab', { name: new RegExp(`^${tab.label}`) }).first(),
      ).toBeVisible({ timeout: 20_000 })
    }

    // Clicar muda a tab seleccionada (aria-selected é o sinal de estado).
    const mensagens = page.getByRole('tab', { name: /^Mensagens/ }).first()
    await mensagens.click()
    await expect(mensagens).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: /^Perfil/ }).first()).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  test('deep-link ?tab= abre a tab correta', async ({ page, request }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)

    for (const tab of TABS) {
      await page.goto(`/area-pessoal?tab=${tab.id}`)
      await expect(
        page.getByRole('tab', { name: new RegExp(`^${tab.label}`) }).first(),
        `?tab=${tab.id} devia selecionar '${tab.label}'`,
      ).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
    }
  })

  test('deep-link ?tab=criador e ?tab=avaliacoes abrem a tab certa', async ({ page, request }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)

    // O rótulo do tab criador varia ('Criador' vs 'Tornar-me criador'
    // quando ainda não há perfil) — o /criador/i cobre ambos.
    await page.goto('/area-pessoal?tab=criador')
    await expect(page.getByRole('tab', { name: /criador/i }).first()).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 20_000 },
    )

    // O tab de avaliações chama-se 'Minhas avaliações' (não 'Avaliações').
    await page.goto('/area-pessoal?tab=avaliacoes')
    await expect(page.getByRole('tab', { name: /^Minhas avaliações/ }).first()).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 20_000 },
    )
  })

  test('?tab inválido cai no Perfil sem rebentar', async ({ page, request }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)
    await page.goto('/area-pessoal?tab=nao-existe')

    await expect(page.getByRole('heading', { name: 'Área pessoal', level: 1 })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('tab', { name: /^Perfil/ }).first()).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // O ErrorBoundary global não pode ter disparado.
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
  })

  test('rotas legacy do painel caem no sítio certo', async ({ page, request }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)

    await page.goto('/publicar/criador')
    await expect(page).toHaveURL(/\/area-pessoal\?tab=criador/, { timeout: 20_000 })

    await page.goto('/publicar/servico')
    await expect(page).toHaveURL(/\/area-pessoal\?tab=servicos/, { timeout: 20_000 })

    await page.goto('/onboarding/criador')
    await expect(page).toHaveURL(/\/area-pessoal\?tab=criador/, { timeout: 20_000 })
  })

  test('falha de rede não deixa o painel em branco', async ({ page, request }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)

    // Simula a API fora do ar *depois* do login: a sessão hidrata do
    // localStorage (sem ida à rede quando o token é fresco), por isso o
    // painel tem de continuar a renderizar a estrutura — as probes do
    // DashboardPage degradam para null (catch) em vez de rebentar.
    await page.route('**/api/**', (route) => route.abort())
    await page.goto('/area-pessoal')

    await expect(page.getByRole('heading', { name: 'Área pessoal', level: 1 })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('tab', { name: /^Perfil/ }).first()).toBeVisible({
      timeout: 20_000,
    })
    // O ErrorBoundary global não pode ter disparado.
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
  })

  test('Sair limpa a sessão e repõe a navbar pública', async ({ page, request }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)
    await page.goto('/area-pessoal')
    await expect(page.getByRole('heading', { name: 'Área pessoal', level: 1 })).toBeVisible({
      timeout: 20_000,
    })

    await page.locator('button[aria-haspopup="menu"]').first().click()
    await page.getByRole('menuitem', { name: /Sair/i }).click()

    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('link', { name: 'Juntar-me', exact: true })).toBeVisible({
      timeout: 20_000,
    })
    // Sem sessão, /area-pessoal volta a proteger-se.
    await page.goto('/area-pessoal')
    await expect(page).toHaveURL(/\/entrar/, { timeout: 20_000 })
  })
})
