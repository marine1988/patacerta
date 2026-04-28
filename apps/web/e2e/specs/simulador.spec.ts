import { test, expect } from '@playwright/test'

/**
 * Simulador de raça — quiz multi-step.
 * Cada clique numa opção avança automaticamente para a próxima
 * pergunta; ao responder à última, dispara POST /api/breed-matcher/match
 * e mostra o top 5 de raças.
 */
test.describe('Simulador de raça', () => {
  test('carrega quiz com 11 perguntas', async ({ page }) => {
    await page.goto('/simulador-raca')

    await expect(page.getByRole('heading', { name: /Encontre o cão ideal/i })).toBeVisible()
    await expect(page.getByText(/Pergunta 1 de \d+/)).toBeVisible()

    // Primeira pergunta
    await expect(page.getByRole('heading', { name: 'Onde mora?' })).toBeVisible()
  })

  test('botão Voltar está desativado no primeiro passo', async ({ page }) => {
    await page.goto('/simulador-raca')
    await expect(page.getByRole('button', { name: /Voltar/i })).toBeDisabled()
  })

  test('responder a todas as perguntas mostra resultados', async ({ page }) => {
    await page.goto('/simulador-raca')

    // Lê o total de passos a partir do indicador
    const stepLabel = await page.getByText(/Pergunta 1 de \d+/).textContent()
    const total = Number(stepLabel?.match(/de (\d+)/)?.[1] ?? 11)
    expect(total).toBeGreaterThanOrEqual(10)

    // Seleciona sempre a primeira opção em cada passo. A primeira opção
    // está dentro do Card e é o primeiro <button type="button"> com classe
    // de opção (gap-1 border).
    for (let i = 0; i < total; i++) {
      const stepHeading = page.locator('h2.font-serif').first()
      await expect(stepHeading).toBeVisible({ timeout: 10_000 })

      // primeira opção dentro do Card
      const firstOption = page.locator('button[type="button"].flex.flex-col').first()
      await firstOption.click()
    }

    // Após responder a todas: mutation chama API e mostra resultados
    // ou estado de loading. Esperamos pelos resultados (heading "#1").
    await expect(page.getByText('#1')).toBeVisible({ timeout: 30_000 })

    // CTA final: "Ver criadores" → /pesquisar
    await expect(page.getByRole('link', { name: /Ver criadores/i })).toBeVisible()
  })

  test('Recomeçar volta à pergunta 1', async ({ page }) => {
    await page.goto('/simulador-raca')

    // Avança um passo
    await page.locator('button[type="button"].flex.flex-col').first().click()
    await expect(page.getByText(/Pergunta 2 de/)).toBeVisible()

    await page.getByRole('button', { name: /Recomeçar/i }).click()
    await expect(page.getByText(/Pergunta 1 de/)).toBeVisible()
  })
})
