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

    // O tab de avaliações chama-se 'As minhas avaliações' (não 'Avaliações').
    await page.goto('/area-pessoal?tab=avaliacoes')
    await expect(page.getByRole('tab', { name: /^As minhas avaliações/ }).first()).toHaveAttribute(
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

  /**
   * M-03: o access token vive em MEMÓRIA; o único estado que persiste é o
   * `user` em localStorage. Um reload completo (`page.goto`) perde o token
   * e a sessão só se repõe via `POST /api/auth/refresh` (cookie httpOnly).
   *
   * Logo, "API fora do ar durante o arranque" já não significa "continuar
   * logado sem rede" (era a premissa antiga): significa sessão irrecuperável.
   * O que este teste fixa é a *degradação*: cai no login de forma limpa —
   * sem ecrã branco, sem ErrorBoundary e sem ciclo de refreshes.
   */
  test('falha de rede na restauração da sessão degrada para /entrar sem rebentar', async ({
    page,
    request,
  }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)

    // API indisponível a partir daqui (inclui /api/status e /api/auth/refresh).
    let refreshRequests = 0
    await page.route('**/api/**', (route) => {
      if (route.request().url().includes('/auth/refresh')) refreshRequests += 1
      return route.abort()
    })

    await page.goto('/area-pessoal')

    // Sessão limpa → aterragem no login, não numa área privada a meio nem num
    // spinner infinito.
    await expect(page).toHaveURL(/\/entrar/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Entrar na PataCerta' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()

    // Sem rebentar: nem ErrorBoundary global nem documento vazio.
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
    expect((await page.locator('body').innerText()).trim().length).toBeGreaterThan(0)

    // Sem tempestade de refreshes — a app desiste da sessão em vez de tentar
    // N vezes — e o estado do cliente fica limpo (nem `user` nem o legado
    // `access_token` que a migração do M-03 remove do storage).
    expect(refreshRequests).toBeLessThanOrEqual(3)
    const leftovers = await page.evaluate(() => ({
      user: window.localStorage.getItem('user'),
      accessToken: window.localStorage.getItem('access_token'),
    }))
    expect(leftovers).toEqual({ user: null, accessToken: null })

    // Sem loop de redirect: passado o instante de estabilização continua no
    // login, com o formulário utilizável.
    await page.waitForTimeout(1_000)
    await expect(page).toHaveURL(/\/entrar/)
    await expect(page.getByRole('heading', { name: 'Entrar na PataCerta' })).toBeVisible()
  })

  /**
   * Contraprova do cenário acima (e a razão pela qual ele degrada): com a API
   * disponível, o reload repõe a sessão **por refresh token**. Se este teste
   * falhar, o de cima passa a "passar por acidente" — nada estaria a repor a
   * sessão e o logout deixaria de significar algo.
   */
  test('reload repõe a sessão via refresh token (access token só em memória)', async ({
    page,
    request,
  }) => {
    await loginViaApi(request, page, CLIENT_EMAIL)

    const refreshCalls: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/refresh')) refreshCalls.push(req.url())
    })

    // Reload completo: o módulo `lib/api.ts` recomeça com `accessToken = null`.
    await page.goto('/area-pessoal')

    await expect(page.getByRole('heading', { name: 'Área pessoal', level: 1 })).toBeVisible({
      timeout: 20_000,
    })
    expect(
      refreshCalls.length,
      'a sessão devia repor-se com POST /api/auth/refresh (cookie httpOnly)',
    ).toBeGreaterThan(0)

    // M-03: o token de acesso nunca fica acessível a JavaScript persistente.
    const storage = await page.evaluate(() => ({
      accessToken: window.localStorage.getItem('access_token'),
      user: window.localStorage.getItem('user'),
    }))
    expect(storage.accessToken).toBeNull()
    expect(storage.user, 'o perfil em cache é o que dispara o refresh no mount').toBeTruthy()

    // E a app está mesmo autenticada (navbar sem "Entrar").
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeHidden()
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
