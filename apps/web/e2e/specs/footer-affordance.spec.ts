import { test, expect, type Page } from '../fixtures/test'

/**
 * Affordance dos itens de lista do footer (PATA-UI-FOOTER-2).
 *
 * Todos os itens interactivos dentro de `footer ul li` — Plataforma, Legal e
 * Redes — têm de partilhar a mesma affordance: sublinhado com a decoração
 * caramel. O botão "Definições de cookies" era o único item sem sublinhado,
 * porque não passa pelo componente `FooterLink`.
 *
 * Universo do assert: `footer ul li a, footer ul li button`. Fica de fora,
 * de propósito:
 *  - o link da marca (`footer > div > a`), que não é sublinhado por desenho;
 *  - o card de feedback (CTA em caixa, não é item de lista);
 *  - a secção "Adopção responsável", que vive fora do `<footer>`.
 *
 * Só lê o DOM — seguro contra produção (@prod-safe).
 */

const CARAMEL_500 = '143, 101, 65' // #8F6541

/** Todos os itens interactivos das listas do footer. */
function footerListItems(page: Page) {
  return page.locator('footer ul li a, footer ul li button')
}

/** O botão que abre o modal de consentimento. */
function cookieButton(page: Page) {
  return page.getByRole('button', { name: 'Definições de cookies' })
}

test.describe('Affordance dos itens do footer', () => {
  test('todos os itens de lista do footer estão sublinhados @prod-safe', async ({ page }) => {
    await page.goto('/')

    // A árvore do footer monta depois do Suspense das rotas — esperar por um
    // item conhecido antes de contar (senão o count sai 0 e o loop é vazio).
    await expect(page.locator('footer')).toBeVisible()
    await expect(cookieButton(page)).toBeVisible()

    const items = footerListItems(page)
    const n = await items.count()

    // Plataforma 5 + Legal 3+1 + Redes 3 = 12. Um número muito abaixo disto
    // significa que o seletor deixou de apanhar o universo (layout mudou).
    expect(n).toBeGreaterThan(10)

    const missing: string[] = []
    for (let i = 0; i < n; i++) {
      const item = items.nth(i)
      const decoration = await item.evaluate((el) => getComputedStyle(el).textDecorationLine)
      if (decoration !== 'underline') {
        missing.push(`${(await item.innerText()).trim() || item.toString()} → ${decoration}`)
      }
    }

    // Relatório legível: diz exactamente que itens destoam, não só que falhou.
    expect(missing, `itens do footer sem sublinhado: ${missing.join(' | ')}`).toEqual([])
  })

  test('o botão de cookies tem a mesma affordance dos links (idle + hover) @prod-safe', async ({
    page,
  }) => {
    await page.goto('/')

    const button = cookieButton(page)
    await expect(button).toBeVisible()
    await expect(button).toHaveCSS('text-decoration-line', 'underline')
    // Idle: decoração caramel a 40% (igual aos `FooterLink`).
    await expect(button).toHaveCSS('text-decoration-color', `rgba(${CARAMEL_500}, 0.4)`)

    // Comparação directa com um link de lista vizinho da mesma coluna.
    const neighbour = page.locator('footer a[href="/termos-pagamento"]')
    expect(await button.evaluate((el) => getComputedStyle(el).textDecorationColor)).toBe(
      await neighbour.evaluate((el) => getComputedStyle(el).textDecorationColor),
    )

    // Hover: a decoração passa a caramel opaco (e o texto também).
    await button.hover()
    await expect(button).toHaveCSS('text-decoration-color', `rgb(${CARAMEL_500})`)
    await expect(button).toHaveCSS('color', `rgb(${CARAMEL_500})`)
  })

  test('o botão de cookies tem foco visível por teclado @prod-safe', async ({ page }) => {
    await page.goto('/')

    // Último link da coluna Legal → Tab entra no botão de cookies.
    await page.locator('footer a[href="/termos-pagamento"]').focus()
    await page.keyboard.press('Tab')

    const button = cookieButton(page)
    await expect(button).toBeFocused()

    const focusVisible = await button.evaluate((el) => el.matches(':focus-visible'))
    expect(focusVisible).toBe(true)

    // `focus-visible:ring-2 ring-caramel-500` desenha o anel em box-shadow.
    const shadow = await button.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow).toContain(CARAMEL_500)
  })
})
