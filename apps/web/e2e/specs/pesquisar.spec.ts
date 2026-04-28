import { test, expect } from '@playwright/test'

test.describe('Pesquisa — criadores e serviços', () => {
  test('alterna entre tabs Criadores e Serviços', async ({ page }) => {
    await page.goto('/pesquisar')

    const criadoresTab = page.getByRole('button', { name: 'Criadores', exact: true })
    const servicosTab = page.getByRole('button', { name: 'Serviços', exact: true })

    await expect(criadoresTab).toHaveAttribute('aria-current', 'page')

    await servicosTab.click()
    await expect(page).toHaveURL(/tipo=servicos/)
    await expect(servicosTab).toHaveAttribute('aria-current', 'page')

    await criadoresTab.click()
    await expect(page).not.toHaveURL(/tipo=servicos/)
    await expect(criadoresTab).toHaveAttribute('aria-current', 'page')
  })

  test('alterna entre vista Lista e Mapa', async ({ page }) => {
    await page.goto('/pesquisar')

    const lista = page.getByRole('tab', { name: 'Lista' })
    const mapa = page.getByRole('tab', { name: 'Mapa' })

    await expect(lista).toHaveAttribute('aria-selected', 'true')

    await mapa.click()
    await expect(page).toHaveURL(/vista=mapa/)
    await expect(mapa).toHaveAttribute('aria-selected', 'true')

    // Container Leaflet deve montar
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 })

    await lista.click()
    await expect(page).not.toHaveURL(/vista=mapa/)
    await expect(lista).toHaveAttribute('aria-selected', 'true')
  })

  test('lista de criadores mostra resultados das seeds', async ({ page }) => {
    await page.goto('/pesquisar')

    // Espera que a lista carregue (aguardar a chamada à API resolver)
    await page.waitForResponse(
      (r) => r.url().includes('/api/breeders') && r.request().method() === 'GET',
      { timeout: 15_000 },
    )

    // Pelo menos um cartão (link para /criador/...) deve aparecer
    const breederLinks = page.locator('a[href^="/criador/"]')
    await expect(breederLinks.first()).toBeVisible({ timeout: 15_000 })
    expect(await breederLinks.count()).toBeGreaterThan(0)
  })

  test('lista de serviços mostra resultados das seeds', async ({ page }) => {
    await page.goto('/pesquisar?tipo=servicos')

    await page.waitForResponse(
      (r) => r.url().includes('/api/services') && r.request().method() === 'GET',
      { timeout: 15_000 },
    )

    const serviceLinks = page.locator('a[href^="/servicos/"]')
    await expect(serviceLinks.first()).toBeVisible({ timeout: 15_000 })
    expect(await serviceLinks.count()).toBeGreaterThan(0)
  })

  test('vista mapa carrega tiles e marcadores', async ({ page }) => {
    await page.goto('/pesquisar?vista=mapa')

    const mapContainer = page.locator('.leaflet-container')
    await expect(mapContainer).toBeVisible({ timeout: 15_000 })

    // Tiles do Leaflet (img class="leaflet-tile") aparecem após load
    await expect(page.locator('img.leaflet-tile').first()).toBeVisible({ timeout: 20_000 })
  })

  test('filtros via URL params são preservados na navegação', async ({ page }) => {
    await page.goto('/pesquisar?tipo=servicos&vista=mapa')
    await expect(page.getByRole('button', { name: 'Serviços', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('tab', { name: 'Mapa' })).toHaveAttribute('aria-selected', 'true')
  })
})
