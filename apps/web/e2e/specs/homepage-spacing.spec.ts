import { test, expect, type Page } from '../fixtures/test'
import { dismissConsentBanner } from '../fixtures/auth'

/**
 * PATA-UI-3: a pesquisa é o primeiro conteúdo depois do header.
 *
 * Não pode existir um bloco CTA, hero, anúncio ou outro spacer entre o
 * limite inferior do header e a secção de pesquisa. A barra pode manter o
 * seu respiro interno, mas a secção que a contém começa colada ao header.
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
  searchTop: number
  searchBottom: number
  ctaTop: number
  ctaBottom: number
  noteTop: number
  searchGapFromHeader: number
  noteOverflow: number
  topLevelOrder: string[]
  adBlocksBeforeSearch: number
  heroBlocksBeforeSearch: number
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
      if (element === search) return 'search'
      if (element === cta) return 'cta'
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
      searchTop: searchRect.top,
      searchBottom: searchRect.bottom,
      ctaTop: ctaRect.top,
      ctaBottom: ctaRect.bottom,
      noteTop: noteRect.top,
      searchGapFromHeader: searchRect.top - headerRect.bottom,
      noteOverflow,
      topLevelOrder,
      adBlocksBeforeSearch,
      heroBlocksBeforeSearch: topLevelElements
        .slice(0, searchIndex)
        .filter((element) => (element.textContent || '').includes('O portal dos')).length,
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
        'search',
        'cta',
        'note',
      ])
      expect(measurement.adBlocksBeforeSearch, JSON.stringify(context)).toBe(0)
      expect(measurement.heroBlocksBeforeSearch, JSON.stringify(context)).toBe(0)
      // A secção de pesquisa é a primeira após o header: só toleramos a
      // eventual linha de 1px da border, nunca um gap vertical real.
      expect(measurement.searchGapFromHeader, JSON.stringify(context)).toBeGreaterThanOrEqual(0)
      expect(measurement.searchGapFromHeader, JSON.stringify(context)).toBeLessThanOrEqual(1)
      expect(measurement.ctaTop, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.searchBottom + 1,
      )
      expect(measurement.ctaBottom, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.noteTop + 1,
      )
      expect(measurement.noteOverflow, JSON.stringify(context)).toBeLessThanOrEqual(1)
      expect(measurement.searchBottom, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.ctaTop + 1,
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
