/**
 * Módulo de Feedback & Sugestões — contrato da API + UI.
 *
 * A parte @prod-safe é read-only (GET /api/feedback + um POST inválido que é
 * rejeitado na validação, sem escrever). Os testes de UI que submetem/votam
 * exigem um ambiente com utilizadores demo (local/stage), pelo que ficam
 * marcados com @mutating e não correm contra produção.
 */

import { test, expect } from '../fixtures/test'
import { API_BASE_URL } from '../fixtures/demo-data'

const CATEGORIES = ['BUG', 'SUGESTAO', 'MELHORIA', 'OUTRO']

test.describe('Contrato da API de feedback @prod-safe', () => {
  test('GET /api/feedback → lista paginada ordenada por votos', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/feedback?limit=5`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as {
      data?: Array<{
        id?: number
        category?: string
        title?: string
        body?: string
        votes?: number
        hasVoted?: boolean
      }>
      meta?: { page?: number; limit?: number; total?: number; totalPages?: number }
    }

    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toBeTruthy()
    expect(body.meta?.page).toBe(1)

    for (const item of body.data ?? []) {
      expect(typeof item.id).toBe('number')
      expect(CATEGORIES).toContain(item.category)
      expect(typeof item.title).toBe('string')
      expect(typeof item.body).toBe('string')
      expect(typeof item.votes).toBe('number')
      // Anónimo: nunca vem marcado como votado.
      expect(item.hasVoted).toBe(false)
    }

    // Ordenação por votos (desc) é o default.
    const votes = (body.data ?? []).map((i) => i.votes ?? 0)
    const sorted = [...votes].sort((a, b) => b - a)
    expect(votes).toEqual(sorted)
  })

  test('GET /api/feedback filtra por categoria', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/feedback?category=BUG&limit=5`)
    expect(res.status()).toBe(200)

    const body = (await res.json()) as { data?: Array<{ category?: string }> }
    for (const item of body.data ?? []) {
      expect(item.category).toBe('BUG')
    }
  })

  test('GET /api/feedback rejeita categoria inválida', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/feedback?category=NAO_EXISTE`)
    expect(res.status()).toBe(400)
  })

  test('POST /api/feedback sem auth → 401', async ({ request }) => {
    const res = await request.post(`${API_BASE_URL}/feedback`, {
      data: {
        category: 'BUG',
        title: 'Teste e2e',
        body: 'Corpo suficientemente longo para validar',
      },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/feedback/:id/vote sem auth → 401', async ({ request }) => {
    const res = await request.post(`${API_BASE_URL}/feedback/1/vote`)
    expect(res.status()).toBe(401)
  })
})

test.describe('Página de feedback — UI @prod-safe', () => {
  test('página /feedback carrega com formulário, filtros e lista', async ({ page }) => {
    await page.goto('/feedback')

    await expect(
      page.getByRole('heading', { name: 'Feedback & Sugestões', level: 1 }),
    ).toBeVisible()

    // Filtros de categoria e ordenação.
    await expect(page.getByLabel('Categoria:')).toBeVisible()
    await expect(page.getByLabel('Ordenar:')).toBeVisible()

    // A lista renderiza ou mostra o empty state — nunca fica em branco.
    const list = page.locator('main')
    await expect(list).toBeVisible()
  })

  test('navbar tem link para /feedback', async ({ page }) => {
    await page.goto('/')
    const link = page.locator('a[href="/feedback"]').first()
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/feedback/)
  })

  test('feedback funciona em dark mode', async ({ page }) => {
    await page.goto('/feedback')
    // Força dark mode via o tema persistido (ThemeContext).
    await page.evaluate(() => {
      window.localStorage.setItem('theme', 'dark')
      document.documentElement.classList.add('dark')
    })
    await expect(
      page.getByRole('heading', { name: 'Feedback & Sugestões', level: 1 }),
    ).toBeVisible()
    // O conteúdo continua legível (elemento visível no dark).
    await expect(page.getByLabel('Ordenar:')).toBeVisible()
  })

  test('feedback é responsivo em mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/feedback')
    await expect(
      page.getByRole('heading', { name: 'Feedback & Sugestões', level: 1 }),
    ).toBeVisible()

    // O menu mobile tem o link de feedback.
    await page.getByRole('button', { name: /Abrir menu/i }).click()
    await expect(page.locator('a[href="/feedback"]').first()).toBeVisible()
  })
})
