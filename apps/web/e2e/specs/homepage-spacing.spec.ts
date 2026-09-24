import { test, expect, type Page } from '../fixtures/test'
import { dismissConsentBanner } from '../fixtures/auth'

/**
 * PATA-UI-2: o topo da homepage é estruturalmente compacto.
 *
 * A ordem intentional é header → bloco compacto do simulador → pesquisa →
 * nota legal. O hero editorial e os destaques continuam abaixo, nunca entre
 * esses três pontos. A janela de 80–180 px mede o intervalo entre o fim do
 * header e o início da pesquisa incluindo o CTA; o layout anterior (≈693 px
 * desktop / ≈399 px mobile) falha automaticamente.
 */

type ViewportCase = {
  label: 'desktop' | 'mobile'
  viewport: { width: number; height: number }
}

const VIEWPORTS: readonly ViewportCase[] = [
  { label: 'desktop', viewport: { width: 1280, height: 900 } },
  { label: 'mobile', viewport: { width: 390, height: 844 } },
]

type TopMeasurement = {
  headerBottom: number
  ctaTop: number
  ctaBottom: number
  searchTop: number
  searchBottom: number
  noteTop: number
  searchGapFromHeader: number
  noteOverflow: number
  topLevelOrder: string[]
  adBlocksBeforeSearch: number
}

async function measureTop(page: Page): Promise<TopMeasurement> {
  return page.evaluate(() => {
    const header = document.querySelector('header')
    const cta = document.querySelector('[data-testid="home-simulator-cta"]')
    const search = document.querySelector('[data-testid="home-search"]')
    const note = document.querySelector('[data-testid="home-simulator-note"]')
    const root = document.querySelector('main')?.firstElementChild
    const topLevelElements = root ? Array.from(root.children) : []

    if (!header || !cta || !search || !note) {
      throw new Error('Homepage sem header, CTA do simulador, pesquisa ou nota legal no topo')
    }

    const headerRect = header.getBoundingClientRect()
    const ctaRect = cta.getBoundingClientRect()
    const searchRect = search.getBoundingClientRect()
    const noteRect = note.getBoundingClientRect()
    const topLevelOrder = topLevelElements.map((element) => {
      if (element === cta) return 'cta'
      if (element === search) return 'search'
      if (element === note) return 'note'
      if (element.querySelector('[data-ad-placement="homepage-mid"]')) return 'ad'
      if ((element.textContent || '').includes('O portal dos')) return 'hero'
      return 'other'
    })
    const searchIndex = topLevelElements.indexOf(search)
    const adBlocksBeforeSearch = topLevelElements
      .slice(0, searchIndex)
      .filter((element) => element.querySelector('[data-ad-placement="homepage-mid"]')).length

    const viewportWidth = document.documentElement.clientWidth
    const noteOverflow = Math.max(
      0,
      noteRect.left < 0 ? -noteRect.left : 0,
      noteRect.right > viewportWidth ? noteRect.right - viewportWidth : 0,
    )

    return {
      headerBottom: headerRect.bottom,
      ctaTop: ctaRect.top,
      ctaBottom: ctaRect.bottom,
      searchTop: searchRect.top,
      searchBottom: searchRect.bottom,
      noteTop: noteRect.top,
      searchGapFromHeader: searchRect.top - headerRect.bottom,
      noteOverflow,
      topLevelOrder,
      adBlocksBeforeSearch,
    }
  })
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }))
  expect(widths.document, `${label}: overflow horizontal`).toBeLessThanOrEqual(widths.viewport + 1)
}

test.describe('Homepage top structure @prod-safe', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsentBanner(page)
  })

  for (const { label, viewport } of VIEWPORTS) {
    test(`mantém header, CTA, pesquisa e nota compactos no ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')

      const ctaLink = page.locator('[data-testid="home-simulator-cta"] a[href="/simulador-raca"]')
      const search = page.locator('[data-testid="home-search"]')
      const note = page.locator('[data-testid="home-simulator-note"]')
      await expect(ctaLink).toBeVisible()
      await expect(search).toBeVisible()
      await expect(note).toBeVisible()

      const measurement = await measureTop(page)
      const context = { label, ...measurement }
      expect(measurement.topLevelOrder.slice(0, 3), JSON.stringify(context)).toEqual([
        'cta',
        'search',
        'note',
      ])
      expect(measurement.adBlocksBeforeSearch, JSON.stringify(context)).toBe(0)
      expect(measurement.searchGapFromHeader, JSON.stringify(context)).toBeGreaterThanOrEqual(80)
      expect(measurement.searchGapFromHeader, JSON.stringify(context)).toBeLessThanOrEqual(180)
      expect(measurement.ctaTop, JSON.stringify(context)).toBeGreaterThanOrEqual(
        measurement.headerBottom,
      )
      expect(measurement.ctaBottom, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.searchTop + 1,
      )
      expect(measurement.noteOverflow, JSON.stringify(context)).toBeLessThanOrEqual(1)
      expect(measurement.searchBottom, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.noteTop + 1,
      )
      await assertNoHorizontalOverflow(page, label)
    })
  }

  test('o CTA do simulador navega para /simulador-raca', async ({ page }) => {
    await page.goto('/')
    const cta = page.locator('[data-testid="home-simulator-cta"] a[href="/simulador-raca"]')
    await expect(cta).toHaveText('Começar simulador')
    await cta.click()
    await expect(page).toHaveURL(/\/simulador-raca$/)
  })

  test('a pesquisa normal dá origem à pesquisa sticky depois do scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const search = page.locator('[data-testid="home-search"]')
    await expect(search).toBeVisible()
    await search.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const sticky = page.locator('[data-testid="sticky-search"]')
    await expect(sticky).toBeVisible()
    await expect(sticky).not.toHaveCSS('top', '0px')
  })
})
