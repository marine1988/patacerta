import { test, expect } from '@playwright/test'

/**
 * Smoke / navegação core do site.
 */
test.describe('Homepage e navegação', () => {
  test('homepage carrega com hero, header e footer', async ({ page }) => {
    await page.goto('/')

    // Logo + wordmark
    await expect(page.getByRole('link', { name: /Pata.*Certa/i }).first()).toBeVisible()

    // Hero — texto característico
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/portal dos/i)

    // CTAs principais
    await expect(page.getByRole('link', { name: /Pesquisar criadores/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Ver serviços/i })).toBeVisible()

    // Manifesto e stats devem estar visíveis
    await expect(page.getByText('Manifesto', { exact: false })).toBeVisible()
  })

  test('navbar permite ir para /pesquisar e /simulador-raca', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Pesquisar', exact: true }).first().click()
    await expect(page).toHaveURL(/\/pesquisar/)
    await expect(page.getByRole('heading', { name: 'Pesquisar', level: 1 })).toBeVisible()

    await page.getByRole('link', { name: 'Simulador', exact: true }).first().click()
    await expect(page).toHaveURL(/\/simulador-raca/)
  })

  test('CTAs do hero levam à pesquisa correta', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: /Pesquisar criadores/i }).click()
    await expect(page).toHaveURL(/\/pesquisar(\?|$)/)
    // Default = criadores → tab Criadores deve estar selecionada
    await expect(page.getByRole('button', { name: 'Criadores', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.goBack()
    await page.getByRole('link', { name: /Ver serviços/i }).click()
    await expect(page).toHaveURL(/\/pesquisar\?tipo=servicos/)
    await expect(page.getByRole('button', { name: 'Serviços', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('navbar mostra Entrar / Juntar-me quando não autenticado', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Juntar-me' })).toBeVisible()
  })

  test('URL inválido devolve a página 404', async ({ page }) => {
    const res = await page.goto('/uma-rota-que-nao-existe-12345')
    // A SPA devolve sempre 200 — assertamos no conteúdo.
    expect(res?.status()).toBeLessThan(500)
    await expect(page.getByText('404', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Página não encontrada/i })).toBeVisible()
    await page.getByRole('link', { name: /Voltar ao início/i }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('páginas legais (Termos e Política de Privacidade) carregam', async ({ page }) => {
    await page.goto('/termos')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.goto('/politica-privacidade')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('redirects legacy preservam query string', async ({ page }) => {
    await page.goto('/diretorio')
    await expect(page).toHaveURL(/\/pesquisar(\?|$)/)

    await page.goto('/servicos')
    await expect(page).toHaveURL(/\/pesquisar\?.*tipo=servicos/)

    await page.goto('/mapa')
    await expect(page).toHaveURL(/\/pesquisar\?.*vista=mapa/)

    await page.goto('/explorar?q=labrador')
    await expect(page).toHaveURL(/\/pesquisar\?.*q=labrador/)
  })
})
