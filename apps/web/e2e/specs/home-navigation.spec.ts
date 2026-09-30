import { test, expect } from '../fixtures/test'

/**
 * Smoke / navegação core do site.
 */
test.describe('Homepage e navegação @prod-safe', () => {
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

    await page.locator('a[href="/simulador-raca"]').first().click()
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

  test('título do simulador é apelativo e orientado ao benefício', async ({ page }) => {
    await page.goto('/')
    const title = page.locator('[data-testid="home-simulator-cta"] h2')
    await expect(title).toContainText(/mais compatível consigo/i)
    await expect(title).not.toContainText(/Não sabe que raça/i)
  })

  test('slider do simulador mostra raças com percentagem de compatibilidade', async ({ page }) => {
    await page.goto('/')
    const slider = page.locator('[data-testid="breed-slider"]')
    await expect(slider).toBeVisible()
    // O card de exemplo mostra uma raça e uma percentagem
    await expect(slider).toContainText(/% match/)
    // Navegação por dots existe
    const dots = slider.locator('button[role="tab"]')
    await expect(dots).toHaveCount(5)
  })

  test('slider auto-play avança automaticamente após 5 segundos', async ({ page }) => {
    await page.goto('/')
    const slider = page.locator('[data-testid="breed-slider"]')
    // Lê o nome da raça activa inicial
    const initialBreed = await slider.locator('p.font-serif').first().textContent()
    // Espera 6s (auto-play é 5s) — a raça deve ter mudado
    await page.waitForTimeout(6000)
    const newBreed = await slider.locator('p.font-serif').first().textContent()
    expect(newBreed).not.toBe(initialBreed)
  })

  test('slider auto-play pausa quando utilizador interage manualmente', async ({ page }) => {
    await page.goto('/')
    const slider = page.locator('[data-testid="breed-slider"]')
    // Clica na 3ª dot para interagir manualmente
    const dots = slider.locator('button[role="tab"]')
    await dots.nth(2).click()
    // Lê a raça após o clique
    const breedAfterClick = await slider.locator('p.font-serif').first().textContent()
    // Espera 6s — o auto-play deve estar pausado, a raça não deve mudar
    await page.waitForTimeout(6000)
    const breedAfterWait = await slider.locator('p.font-serif').first().textContent()
    expect(breedAfterWait).toBe(breedAfterClick)
  })

  test('slider auto-play retoma após 10 segundos sem interacção', async ({ page }) => {
    await page.goto('/')
    const slider = page.locator('[data-testid="breed-slider"]')
    // Interage manualmente para pausar
    const dots = slider.locator('button[role="tab"]')
    await dots.nth(1).click()
    const breedAfterClick = await slider.locator('p.font-serif').first().textContent()
    // Espera 11s (resume delay é 10s) — o auto-play deve ter retomado
    await page.waitForTimeout(11000)
    const breedAfterResume = await slider.locator('p.font-serif').first().textContent()
    expect(breedAfterResume).not.toBe(breedAfterClick)
  })

  test('navbar mostra Entrar / Juntar-me quando não autenticado', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Juntar-me', exact: true })).toBeVisible()
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

  test('botão "Ver todos os criadores" leva à pesquisa de criadores', async ({ page }) => {
    await page.goto('/')
    const btn = page.getByRole('link', { name: 'Ver todos os criadores' })
    await expect(btn).toBeVisible()
    await btn.click()
    await expect(page).toHaveURL(/\/pesquisar(\?|$)/)
    await expect(page.getByRole('button', { name: 'Criadores', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('botão "Ver todos os serviços" leva à pesquisa de serviços', async ({ page }) => {
    await page.goto('/')
    // Escopo à secção "Serviços em foco" (home-featured-services): a homepage
    // tem um segundo link com o mesmo texto na secção editorial "Serviços
    // para patudos" — ambos legítimos, mas o teste é sobre o botão do card.
    const section = page.locator('[data-testid="home-featured-services"]')
    const btn = section.getByRole('link', { name: 'Ver todos os serviços' })
    await expect(btn).toBeVisible()
    await btn.click()
    await expect(page).toHaveURL(/\/pesquisar\?tipo=servicos/)
    await expect(page.getByRole('button', { name: 'Serviços', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('dark mode alterna e mantém a classe no <html>', async ({ page }) => {
    await page.goto('/')
    // Limpa qualquer preferência anterior
    await page.evaluate(() => localStorage.removeItem('patacerta:theme'))
    await page.reload()

    // Inicialmente sem classe dark (light mode)
    const hasDarkBefore = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(hasDarkBefore).toBe(false)

    // Clica no toggle de tema (botão no header)
    const toggle = page.locator('button[aria-label*="modo" i]').first()
    await toggle.click()

    // A classe dark deve estar presente
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.classList.contains('dark')),
      )
      .toBe(true)

    // Slider e pesquisa devem estar visíveis em dark mode
    await expect(page.locator('[data-testid="breed-slider"]')).toBeVisible()
    await expect(page.locator('[data-testid="home-search"]')).toBeVisible()

    // Recarregar mantém a preferência
    await page.reload()
    const hasDarkAfterReload = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(hasDarkAfterReload).toBe(true)
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
