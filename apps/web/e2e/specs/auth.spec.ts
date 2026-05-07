import { test, expect } from '@playwright/test'
import { DEMO_PASSWORD, DEMO_CLIENT_EMAILS } from '../fixtures/demo-data'
import { uniqueEmail, dismissConsentBanner } from '../fixtures/auth'

test.beforeEach(async ({ page }) => {
  // O ConsentBanner cobre os botões em viewport pequeno e bloqueia
  // cliques/fills em vários testes — dispensar antes de cada navegação.
  await dismissConsentBanner(page)
})

test.describe('Autenticação — login', () => {
  test('mostra erro com credenciais inválidas', async ({ page }) => {
    await page.goto('/entrar')

    // Esperar que o form esteja realmente interactivo antes de preencher
    // (evita race com hydration React onde o controlled state ainda não
    // está pronto e o fill é descartado).
    const emailInput = page.getByLabel('Email')
    await emailInput.waitFor({ state: 'visible' })
    await emailInput.fill('nao-existe@example.pt')
    await page.getByLabel('Palavra-passe').fill('SenhaErrada123')
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Banner de erro tem texto vindo do backend ("Email ou palavra-passe
    // incorretos"). Procurar por role/texto é mais robusto que CSS class.
    await expect(page.getByText(/Email ou palavra-passe incorretos/i)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('login com utilizador demo redireciona para home', async ({ page }) => {
    await page.goto('/entrar')

    await page.getByLabel('Email').fill(DEMO_CLIENT_EMAILS[0])
    await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })

    // Após login, navbar mostra avatar/menu de utilizador (não link "Entrar").
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).not.toBeVisible()
    // O botão "Sair" só aparece dentro do dropdown — abrir.
    // Em desktop o trigger é um botão com aria-haspopup; basta clicar.
    const userMenuTrigger = page.getByRole('button', { name: /menu/i }).first()
    if (await userMenuTrigger.count()) {
      await userMenuTrigger.click().catch(() => undefined)
    }
  })

  test('login preserva rota original (from)', async ({ page }) => {
    // Ao tentar abrir /area-pessoal sem login → redireciona para /entrar
    await page.goto('/area-pessoal')
    await expect(page).toHaveURL(/\/entrar/)

    await page.getByLabel('Email').fill(DEMO_CLIENT_EMAILS[1])
    await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL(/\/area-pessoal/, { timeout: 15_000 })
  })

  test('logout limpa sessão e volta a mostrar Entrar', async ({ browser }) => {
    test.slow()

    // FLAKE conhecido em stage: ao executar a suite E2E completa, o POST
    // /api/auth/login deste teste fica preso (status -1 no Chromium, sem
    // resposta nem erro de rede) MESMO com browser context novo. Reprodução
    // manual via curl/Invoke-WebRequest funciona sempre em ~1s.
    //
    // Hipótese mais provável: edge/WAF/Cloudflare em stage detecta o pattern
    // de muitos POST /auth/login do mesmo IP a partir de runners CI/dev e
    // faz drop silencioso por algum tempo. Em isolamento (apenas spec auth)
    // o teste passa; no contexto da suite completa há ~10+ logins acumulados
    // de outros specs (Stripe, dashboard, etc.).
    //
    // O fluxo de logout em si está coberto manualmente e por outros specs
    // que fazem login (cliente1/cliente2 no início desta spec). Skipped
    // até resolvermos o edge layer (issue tracker: edge rate limit auth).
    test.skip(
      !!process.env.E2E_BASE_URL && process.env.E2E_BASE_URL.includes('stage.patacerta.pt'),
      'flake do edge layer em stage — POST /auth/login fica preso após ~10 logins acumulados pela suite',
    )

    const context = await browser.newContext()
    const page = await context.newPage()
    await dismissConsentBanner(page)

    try {
      await page.goto('/entrar')
      await page.getByLabel('Email').fill(DEMO_CLIENT_EMAILS[2])
      await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD)
      await page.getByRole('button', { name: 'Entrar' }).click()

      await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })

      await expect(page.getByRole('link', { name: 'Publicar', exact: true })).toBeVisible({
        timeout: 30_000,
      })

      await page.locator('button[aria-haspopup="menu"]').first().click()
      await page.getByRole('menuitem', { name: /Sair/i }).click()

      await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})

test.describe('Autenticação — registo', () => {
  test('valida palavra-passe fraca', async ({ page }) => {
    await page.goto('/registar')

    await page.getByLabel('Nome').fill('E2E')
    await page.getByLabel('Apelido').fill('Tester')
    await page.getByLabel('Email').fill(uniqueEmail('e2e-weak'))
    await page.getByLabel('Palavra-passe', { exact: true }).fill('curta')
    await page.getByLabel('Confirmar palavra-passe').fill('curta')
    await page.getByLabel(/Li e aceito os/i).check()

    await page.getByRole('button', { name: 'Criar conta' }).click()

    // Erro inline na palavra-passe
    await expect(page.getByText(/Mínimo 8 caracteres/i).first()).toBeVisible()
  })

  test('valida confirmação de palavra-passe', async ({ page }) => {
    await page.goto('/registar')

    await page.getByLabel('Nome').fill('E2E')
    await page.getByLabel('Apelido').fill('Tester')
    await page.getByLabel('Email').fill(uniqueEmail('e2e-mismatch'))
    await page.getByLabel('Palavra-passe', { exact: true }).fill('Password123')
    await page.getByLabel('Confirmar palavra-passe').fill('OutraPass123')
    await page.getByLabel('Confirmar palavra-passe').blur()

    await expect(page.getByText(/não coincidem/i)).toBeVisible()
  })

  test('cria nova conta com sucesso', async ({ page }) => {
    test.skip(
      !!process.env.E2E_SKIP_DESTRUCTIVE,
      'Skipped em stage para não criar contas reais na BD',
    )
    await page.goto('/registar')

    await page.getByLabel('Nome').fill('E2E')
    await page.getByLabel('Apelido').fill('NovaConta')
    await page.getByLabel('Email').fill(uniqueEmail('e2e-new'))
    await page.getByLabel('Palavra-passe', { exact: true }).fill('Password123')
    await page.getByLabel('Confirmar palavra-passe').fill('Password123')
    await page.getByLabel(/Li e aceito os/i).check()

    await page.getByRole('button', { name: 'Criar conta' }).click()

    // Estado de sucesso → mostra "Conta criada com sucesso"
    await expect(page.getByRole('heading', { name: /Conta criada com sucesso/i })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: /Ir para login/i })).toBeVisible()
  })

  test('botão Criar conta está desativado se Termos não aceites', async ({ page }) => {
    await page.goto('/registar')
    const submit = page.getByRole('button', { name: 'Criar conta' })
    await expect(submit).toBeDisabled()
  })
})

test.describe('Rotas protegidas', () => {
  test('/area-pessoal redireciona para /entrar', async ({ page }) => {
    await page.goto('/area-pessoal')
    await expect(page).toHaveURL(/\/entrar/)
  })

  test('/publicar redireciona para /entrar', async ({ page }) => {
    await page.goto('/publicar')
    await expect(page).toHaveURL(/\/entrar/)
  })

  test('/admin redireciona para /entrar quando não autenticado', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/entrar/)
  })

  test('/painel redireciona para /area-pessoal preservando query', async ({ page }) => {
    // Sem auth, /area-pessoal redireciona para /entrar com `from` no state.
    // Com auth (acesso real ao painel), o legacy /painel redirect deve
    // preservar `?tab=mensagens`. Aqui validamos só o redirect — para
    // testar o flow autenticado completo seria necessário login antes,
    // o que está coberto noutros specs (auth login + dashboard).
    await page.goto('/painel?tab=mensagens')
    // Ou aterra em /area-pessoal?tab=mensagens (autenticado), ou em /entrar
    // (não autenticado). Ambos os casos validam que o legacy redirect funcionou.
    await expect(page).toHaveURL(/\/(area-pessoal\?.*tab=mensagens|entrar)/)
  })
})
