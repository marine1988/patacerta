import { test, expect, type Page } from '../fixtures/test'

/**
 * Links das redes sociais oficiais no footer (PATA-SOCIAL-1).
 *
 * A fonte única é `apps/web/src/lib/social.ts`; este spec replica a lista
 * para apanhar regressões de href/atributos (um handle errado no footer é
 * invisível a olho e só se prova comparando com o contrato).
 *
 * Só lê o DOM — seguro contra produção (@prod-safe).
 */
const EXPECTED_SOCIAL_LINKS = [
  {
    id: 'instagram',
    network: 'Instagram',
    handle: '@patacerta.pt',
    url: 'https://www.instagram.com/patacerta.pt/',
  },
  {
    id: 'youtube',
    network: 'YouTube',
    handle: '@patacerta-pt',
    url: 'https://www.youtube.com/@patacerta-pt',
  },
  {
    id: 'tiktok',
    network: 'TikTok',
    handle: '@patacerta.pt',
    url: 'https://www.tiktok.com/@patacerta.pt',
  },
] as const

/** Bloco de redes do footer (`<nav aria-label="Redes sociais">`). */
function socialBlock(page: Page) {
  return page.locator('[data-testid="footer-social"]')
}

test.describe('Redes sociais no footer @prod-safe', () => {
  test('footer mostra exactamente 3 links sociais com os hrefs oficiais', async ({ page }) => {
    await page.goto('/')

    const links = socialBlock(page).locator('a')
    await expect(links).toHaveCount(EXPECTED_SOCIAL_LINKS.length)

    for (const [index, expected] of EXPECTED_SOCIAL_LINKS.entries()) {
      const link = links.nth(index)
      await expect(link).toHaveAttribute('href', expected.url)
      // Nome visível = nome da rede (o handle vive no aria-label/title).
      await expect(link).toContainText(expected.network)
    }
  })

  test('cada link abre em nova janela, com rel seguro e nome acessível', async ({ page }) => {
    await page.goto('/')

    for (const expected of EXPECTED_SOCIAL_LINKS) {
      const link = page.locator(`[data-testid="social-link-${expected.id}"]`)
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', expected.url)
      await expect(link).toHaveAttribute('target', '_blank')
      // RegExp: `rel` pode ganhar tokens no futuro sem quebrar o assert.
      await expect(link).toHaveAttribute('rel', /\bnoopener\b/)
      await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/)
      // Nome acessível (leitor de ecrã) — rede + handle.
      await expect(link).toHaveAccessibleName(
        `PataCerta no ${expected.network} — ${expected.handle}`,
      )
    }
  })

  test('links sociais são alcançáveis por Tab, na ordem, com foco visível', async ({ page }) => {
    await page.goto('/')

    // A coluna Legal (botão de cookies) é o último elemento tabulável antes
    // da coluna Contacto — Tab a partir dele entra na lista de redes.
    await page.getByRole('button', { name: 'Definições de cookies' }).focus()

    const reached: string[] = []
    for (let i = 0; i < EXPECTED_SOCIAL_LINKS.length; i++) {
      await page.keyboard.press('Tab')
      reached.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('data-testid') ??
            document.activeElement?.tagName ??
            '',
        ),
      )
    }

    expect(reached).toEqual(EXPECTED_SOCIAL_LINKS.map((s) => `social-link-${s.id}`))

    // O foco chegou por teclado → `:focus-visible` casa e o anel é desenhado.
    const focusedVisible = await page.evaluate(() => {
      const active = document.activeElement
      return active instanceof HTMLElement && active.matches(':focus-visible')
    })
    expect(focusedVisible).toBe(true)
  })

  test('a 375px os links sociais não provocam overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    const block = socialBlock(page)
    await block.scrollIntoViewIfNeeded()
    await expect(block).toBeVisible()
    await expect(block.locator('a')).toHaveCount(EXPECTED_SOCIAL_LINKS.length)

    const overflow = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="footer-social"]')
      if (!nav) return { missing: true, right: 0, width: 0 }
      const rect = nav.getBoundingClientRect()
      const links = Array.from(nav.querySelectorAll('a'))
      const worst = links.reduce(
        (max, link) => Math.max(max, link.getBoundingClientRect().right),
        0,
      )
      return {
        missing: false,
        right: Math.max(rect.right, worst),
        width: window.innerWidth,
      }
    })

    expect(overflow.missing).toBe(false)
    expect(overflow.right).toBeLessThanOrEqual(overflow.width + 1)
    // Sem scroll horizontal na página (o footer não empurra o layout).
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(375 + 1)
  })
})
