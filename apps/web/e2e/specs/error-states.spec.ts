/**
 * Estados de erro e recuperação de palavra-passe — @prod-safe (read-only).
 *
 * Cobre os caminhos onde falhas são silenciosas por natureza: rotas
 * inexistentes, IDs inválidos, tokens inválidos, e o pedido de reset de
 * palavra-passe (que TEM de ser genérico para não permitir enumeração de
 * contas — requisito de segurança, não de UX).
 *
 * Nota: o pedido de reset usa sempre um endereço inexistente em
 * `@e2e.patacerta.test`, para nunca disparar email a utilizadores reais.
 */

import { test, expect } from '../fixtures/test'
import { dismissConsentBanner } from '../fixtures/auth'

const NON_EXISTENT_EMAIL = 'reset-e2e+naoexiste@e2e.patacerta.test'
/**
 * Texto REAL do estado de sucesso (apps/web/src/pages/auth/ResetPasswordPage.tsx).
 * Deliberadamente genérico: a mesma mensagem aparece exista ou não a conta.
 */
const GENERIC_RESET_MESSAGE =
  /Se o email existir na nossa plataforma, receberá instruções para repor a palavra-passe/i

test.beforeEach(async ({ page }) => {
  // O ConsentBanner é `fixed bottom` e engole cliques em botões de submissão
  // (pitfall documentado em fixtures/auth.ts). Sem isto o submit do
  // formulário de recuperação de palavra-passe nunca dispara.
  await dismissConsentBanner(page)
})

test.describe('Estados de erro @prod-safe', () => {
  test('rota inexistente mostra 404 e volta ao início', async ({ page }) => {
    const res = await page.goto('/rota-que-nao-existe-abc123')
    // A SPA devolve 200 no HTML; o que importa é não ser erro de servidor.
    expect(res?.status() ?? 0).toBeLessThan(500)

    await expect(page.getByRole('heading', { name: /Página não encontrada/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('404', { exact: false })).toBeVisible()
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      'content',
      /noindex/,
      { timeout: 15_000 },
    )

    await page.getByRole('link', { name: /Voltar ao início/i }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('ID de criador inexistente mostra estado 404 e fica noindex', async ({ page, caps }) => {
    test.skip(!caps.apiHealthy, 'API indisponível — não é possível avaliar o estado de erro')

    await page.goto('/criador/999999')
    await expect(page.getByRole('heading', { name: /Criador não encontrado/i })).toBeVisible({
      timeout: 25_000,
    })
    // Página de erro não pode acabar indexada (defesa contra soft-404).
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      'content',
      /noindex/,
      { timeout: 15_000 },
    )
  })

  test('ID de serviço inexistente mostra estado 404 e fica noindex', async ({ page, caps }) => {
    test.skip(!caps.apiHealthy, 'API indisponível — não é possível avaliar o estado de erro')

    await page.goto('/servicos/999999')
    await expect(page.getByRole('heading', { name: /Anúncio não encontrado/i })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      'content',
      /noindex/,
      { timeout: 15_000 },
    )
  })

  test('ID não numérico não rebenta o detalhe', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/criador/abc-invalido')
    // Qualquer que seja o estado (404 amigável), tem de haver conteúdo e h1.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
    expect(errors, `excepções de JS: ${errors.join(' || ')}`).toEqual([])
  })

  test('recuperação de palavra-passe devolve mensagem genérica (anti-enumeração)', async ({
    page,
  }) => {
    await page.goto('/recuperar-palavra-passe')

    const email = page.getByLabel('Email')
    await expect(email).toBeVisible({ timeout: 20_000 })
    await email.fill(NON_EXISTENT_EMAIL)
    await page.getByRole('button', { name: /Enviar instruções/i }).click()

    // A mensagem tem de ser genérica exista ou não a conta — caso contrário
    // o formulário torna-se um oráculo de enumeração de emails.
    // Texto real (apps/web/src/pages/auth/ResetPasswordPage.tsx):
    //   "Se o email existir na nossa plataforma, receberá instruções para
    //    repor a palavra-passe."
    await expect(page.getByRole('heading', { name: /Email enviado/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(GENERIC_RESET_MESSAGE)).toBeVisible()
  })

  test('recuperação não avança com email malformado (validação do browser)', async ({ page }) => {
    await page.goto('/recuperar-palavra-passe')
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 20_000 })

    let calledApi = false
    page.on('request', (r) => {
      if (r.url().includes('/api/auth/forgot-password')) calledApi = true
    })

    const email = page.getByLabel('Email')
    await email.fill('isto-nao-e-um-email')
    await page.getByRole('button', { name: /Enviar instruções/i }).click()

    // O input é `type="email" required`, por isso a validação NATIVA do
    // browser bloqueia a submissão antes do handler React — o Zod
    // (`forgotPasswordSchema`) nunca chega a correr neste caso e não há
    // mensagem React para procurar. O invariante testável é: submissão
    // bloqueada, sem ida à rede, sem estado de sucesso.
    const invalid = await email.evaluate((el) => !(el as HTMLInputElement).checkValidity())
    expect(invalid, 'o browser devia marcar o email como inválido').toBe(true)

    await expect(page.getByRole('heading', { name: /Email enviado/i })).toBeHidden()
    expect(calledApi, 'o cliente não devia contactar a API com um email inválido').toBe(false)
  })

  test('token de verificação inválido mostra erro amigável', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/verificar-email?token=token-invalido-e2e')

    await expect(
      page.getByRole('heading', { name: /Verificação falhou|Verificar email/i }),
    ).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
    expect(errors, `excepções de JS: ${errors.join(' || ')}`).toEqual([])
  })

  test('nenhuma rota pública fica em branco', async ({ page }) => {
    const routes = [
      '/rota-inexistente-1',
      '/criador/999999',
      '/servicos/999999',
      '/recuperar-palavra-passe',
      '/verificar-email?token=invalido',
    ]

    for (const route of routes) {
      await page.goto(route)
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
        `${route} ficou sem conteúdo visível`,
      ).toBeVisible({ timeout: 25_000 })
    }
  })
})

/**
 * Complemento E2E-9 (não duplica o bloco acima): cobre os casos do card que
 * ainda não tinham teste — `/servicos/:id` não-numérico, tabela de rotas
 * protegidas, recuperação com interceção (zero chamadas reais à API de
 * produção) e error-boundary da homepage sob 500 da API.
 */
test.describe('Estados de erro — complemento E2E-9 @prod-safe', () => {
  test('ID de serviço não numérico não rebenta', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/servicos/abc-invalido')
    // Estado 404 amigável («Anúncio não encontrado») ou detalhe por slug —
    // em qualquer caso há conteúdo, h1 e zero exceções de JS.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
    expect(errors, `excepções de JS: ${errors.join(' || ')}`).toEqual([])
  })

  test('rotas protegidas redirecionam para /entrar sem sessão', async ({ page }) => {
    const protectedRoutes = ['/publicar', '/area-pessoal', '/admin']

    for (const route of protectedRoutes) {
      await page.goto(route)
      await expect(page, `${route} devia redirecionar para /entrar`).toHaveURL(/\/entrar/, {
        timeout: 20_000,
      })
    }
  })

  test('recuperação intercetada mostra a mesma mensagem genérica (zero chamadas reais)', async ({
    page,
  }) => {
    let mocked = false
    // Cada teste com o seu page.route — o mock não vaza para outros testes.
    await page.route('**/forgot-password**', (route) => {
      mocked = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto('/recuperar-palavra-passe')
    const email = page.getByLabel('Email')
    await expect(email).toBeVisible({ timeout: 20_000 })
    await email.fill('conta-existente-e2e@e2e.patacerta.test')
    await page.getByRole('button', { name: /Enviar instruções/i }).click()

    // A MESMA mensagem genérica do teste com email inexistente —
    // anti-enumeração: o formulário nunca revela se a conta existe.
    await expect(page.getByRole('heading', { name: /Email enviado/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(GENERIC_RESET_MESSAGE)).toBeVisible()
    expect(mocked, 'o pedido devia ter sido intercetado (zero chamadas reais)').toBe(true)
  })

  test('erro 500 da API não deixa a homepage em branco', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'e2e-simulated-500' }),
      }),
    )

    await page.goto('/')
    // O hero (h1 estático) tem de continuar visível mesmo com a API em baixo —
    // a regressão clássica de error boundary é a página ficar em branco.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/Algo correu mal/i)).toBeHidden()
    expect(errors, `excepções de JS: ${errors.join(' || ')}`).toEqual([])
  })
})
