import { test, expect } from '@playwright/test'
import { DEMO_PASSWORD, DEMO_CLIENT_EMAILS } from '../fixtures/demo-data'
import { uniqueEmail } from '../fixtures/auth'

test.describe('Autenticação — login', () => {
  test('mostra erro com credenciais inválidas', async ({ page }) => {
    await page.goto('/entrar')

    await page.getByLabel('Email').fill('nao-existe@example.pt')
    await page.getByLabel('Palavra-passe').fill('SenhaErrada123')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.locator('div.bg-red-50')).toBeVisible({ timeout: 10_000 })
  })

  test('login com utilizador demo redireciona para home', async ({ page }) => {
    await page.goto('/entrar')

    await page.getByLabel('Email').fill(DEMO_CLIENT_EMAILS[0])
    await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/', { timeout: 15_000 })

    // Após login a navbar deve mostrar "Área pessoal"
    await expect(page.getByRole('link', { name: /Área pessoal/i })).toBeVisible()
    // E não deve mais mostrar "Entrar"
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).not.toBeVisible()
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

  test('logout limpa sessão e volta a mostrar Entrar', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('Email').fill(DEMO_CLIENT_EMAILS[2])
    await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/', { timeout: 15_000 })

    await page.getByRole('button', { name: 'Sair' }).click()

    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible()
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
    await page.goto('/painel?tab=mensagens')
    await expect(page).toHaveURL(/\/area-pessoal\?.*tab=mensagens/)
  })
})
