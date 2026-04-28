import { test, expect } from '@playwright/test'
import { getFirstBreeder, getFirstService } from '../fixtures/api'

test.describe('Detalhe de criador', () => {
  test('abre perfil a partir da pesquisa', async ({ page }) => {
    await page.goto('/pesquisar')

    const firstBreederLink = page.locator('a[href^="/criador/"]').first()
    await expect(firstBreederLink).toBeVisible({ timeout: 15_000 })

    const href = await firstBreederLink.getAttribute('href')
    await firstBreederLink.click()

    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('carrega perfil de criador via URL direto', async ({ request, page }) => {
    const breeder = await getFirstBreeder(request)
    await page.goto(`/criador/${breeder.id}`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(breeder.businessName)
  })

  test('ID inválido mostra mensagem "Criador não encontrado"', async ({ page }) => {
    await page.goto('/criador/999999')
    await expect(page.getByRole('heading', { name: /Criador não encontrado/i })).toBeVisible({
      timeout: 15_000,
    })
  })
})

test.describe('Detalhe de serviço', () => {
  test('abre serviço a partir da pesquisa', async ({ page }) => {
    await page.goto('/pesquisar?tipo=servicos')

    const firstServiceLink = page.locator('a[href^="/servicos/"]').first()
    await expect(firstServiceLink).toBeVisible({ timeout: 15_000 })

    await firstServiceLink.click()
    await expect(page).toHaveURL(/\/servicos\/\d+/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('carrega serviço via URL direto', async ({ request, page }) => {
    const service = await getFirstService(request)
    await page.goto(`/servicos/${service.id}`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(service.title)
  })

  test('ID inválido mostra mensagem "Anúncio não encontrado"', async ({ page }) => {
    await page.goto('/servicos/999999')
    await expect(page.getByRole('heading', { name: /Anúncio não encontrado/i })).toBeVisible({
      timeout: 15_000,
    })
  })
})
