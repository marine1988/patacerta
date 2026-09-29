import { test, expect, type Page } from '../fixtures/test'
import { dismissConsentBanner } from '../fixtures/auth'

/**
 * PATA-HOME-REORDER: a homepage tem a seguinte ordem de elementos:
 *   1. Slider do simulador (breed-slider)
 *   2. Pesquisa (home-search)
 *   3. Criadores em foco (home-featured-breeders)
 *   4. Simulador CTA (home-simulator-cta)
 *   5. Nota legal (home-simulator-note)
 *
 * O slider é o primeiro elemento após o header. A pesquisa vem colada
 * ao slider. Os criadores em foco vêm depois da pesquisa. O simulador
 * CTA fica abaixo dos criadores em foco.
 */

type ViewportCase = {
  label: 'desktop-1920' | 'desktop' | 'mobile'
  viewport: { width: number; height: number }
}

const VIEWPORTS: readonly ViewportCase[] = [
  { label: 'desktop-1920', viewport: { width: 1920, height: 900 } },
  { label: 'desktop', viewport: { width: 1280, height: 900 } },
  { label: 'mobile', viewport: { width: 390, height: 844 } },
]

type TopMeasurement = {
  headerBottom: number
  sliderTop: number
  sliderBottom: number
  searchTop: number
  searchBottom: number
  formTop: number
  formBottom: number
  breedersTop: number
  breedersBottom: number
  ctaTop: number
  ctaBottom: number
  noteTop: number
  searchGapFromHeader: number
  /** O que o utilizador vê: barra branca menos limite inferior do header. */
  formGapFromHeader: number
  noteOverflow: number
  topLevelOrder: string[]
  adBlocksBeforeSearch: number
  heroBlocksBeforeSearch: number
}

async function measureTop(page: Page): Promise<TopMeasurement> {
  return page.evaluate(() => {
    const header = document.querySelector('header')
    const slider = document.querySelector('[data-testid="home-breed-slider"]')
    const search = document.querySelector('[data-testid="home-search"]')
    const form = search?.querySelector('form')
    const breeders = document.querySelector('[data-testid="home-featured-breeders"]')
    const cta = document.querySelector('[data-testid="home-simulator-cta"]')
    const note = document.querySelector('[data-testid="home-simulator-note"]')
    const root = document.querySelector('main')?.firstElementChild
    const topLevelElements = root ? Array.from(root.children) : []

    if (!header || !slider || !search || !form || !breeders || !cta || !note) {
      throw new Error(
        'Homepage sem header, slider, pesquisa, criadores em foco, CTA do simulador ou nota legal',
      )
    }

    const headerRect = header.getBoundingClientRect()
    const sliderRect = slider.getBoundingClientRect()
    const searchRect = search.getBoundingClientRect()
    const formRect = form.getBoundingClientRect()
    const breedersRect = breeders.getBoundingClientRect()
    const ctaRect = cta.getBoundingClientRect()
    const noteRect = note.getBoundingClientRect()
    const topLevelOrder = topLevelElements.map((element) => {
      if (element === slider) return 'slider'
      if (element === search) return 'search'
      if (element === breeders) return 'breeders'
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
      sliderTop: sliderRect.top,
      sliderBottom: sliderRect.bottom,
      searchTop: searchRect.top,
      searchBottom: searchRect.bottom,
      formTop: formRect.top,
      formBottom: formRect.bottom,
      breedersTop: breedersRect.top,
      breedersBottom: breedersRect.bottom,
      ctaTop: ctaRect.top,
      ctaBottom: ctaRect.bottom,
      noteTop: noteRect.top,
      searchGapFromHeader: searchRect.top - headerRect.bottom,
      formGapFromHeader: formRect.top - headerRect.bottom,
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

type StickyMeasurement = {
  headerBottom: number
  stickyTop: number
  formTop: number
  inputTop: number
  cssTop: string
}

async function measureStickySearch(page: Page): Promise<StickyMeasurement> {
  return page.evaluate(() => {
    const header = document.querySelector('header')
    const sticky = document.querySelector('[data-testid="sticky-search"]')
    const form = sticky?.querySelector('form')
    const input = sticky?.querySelector('input[type="text"]')

    if (!header || !sticky || !form || !input) {
      throw new Error('Homepage sem header, sticky search, formulário ou input visível')
    }

    return {
      headerBottom: header.getBoundingClientRect().bottom,
      stickyTop: sticky.getBoundingClientRect().top,
      formTop: form.getBoundingClientRect().top,
      inputTop: input.getBoundingClientRect().top,
      cssTop: getComputedStyle(sticky).top,
    }
  })
}

test.describe('Homepage top structure @prod-safe', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsentBanner(page)
  })

  for (const { label, viewport } of VIEWPORTS) {
    test(`a pesquisa sticky fica colada ao header depois do scroll no ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')

      const originalSearch = page.locator('[data-testid="home-search"]')
      await expect(originalSearch).toBeVisible()
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await expect
        .poll(async () =>
          originalSearch.evaluate((element) => element.getBoundingClientRect().bottom <= 0),
        )
        .toBe(true)

      const sticky = page.locator('[data-testid="sticky-search"]')
      const stickyInput = sticky.locator('input[type="text"]')
      await expect(sticky).toBeVisible()
      await expect(stickyInput).toBeVisible()
      await page.waitForFunction(() => {
        const header = document.querySelector('header')
        const sticky = document.querySelector('[data-testid="sticky-search"]')
        if (!header || !sticky) return false
        const gap = sticky.getBoundingClientRect().top - header.getBoundingClientRect().bottom
        return gap >= 0 && gap <= 1
      })

      const measurement = await measureStickySearch(page)
      const context = { label, ...measurement }
      const gap = measurement.stickyTop - measurement.headerBottom
      expect(gap, JSON.stringify(context)).toBeGreaterThanOrEqual(0)
      expect(gap, JSON.stringify(context)).toBeLessThanOrEqual(1)
      expect(measurement.formTop, JSON.stringify(context)).toBeGreaterThanOrEqual(
        measurement.headerBottom,
      )
      expect(measurement.inputTop, JSON.stringify(context)).toBeGreaterThanOrEqual(
        measurement.headerBottom,
      )
      expect(measurement.cssTop, `${label}: top CSS não pode ser fixo a 80px`).not.toBe('80px')

      await stickyInput.fill('Pastor Belga Malinois')
      await expect(stickyInput).toHaveValue('Pastor Belga Malinois')
      await assertNoHorizontalOverflow(page, label)
    })

    test(`mantém slider, pesquisa, criadores, CTA e nota na ordem correcta no ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')

      const slider = page.locator('[data-testid="home-breed-slider"]')
      const search = page.locator('[data-testid="home-search"]')
      const breeders = page.locator('[data-testid="home-featured-breeders"]')
      const ctaLink = page.locator('[data-testid="home-simulator-cta"] a[href="/simulador-raca"]')
      const note = page.locator('[data-testid="home-simulator-note"]')
      await expect(slider).toBeVisible()
      await expect(search).toBeVisible()
      await expect(breeders).toBeVisible()
      await expect(ctaLink).toBeVisible()
      await expect(note).toBeVisible()

      const measurement = await measureTop(page)
      const context = { label, ...measurement }
      expect(measurement.topLevelOrder.slice(0, 5), JSON.stringify(context)).toEqual([
        'slider',
        'search',
        'breeders',
        'cta',
        'note',
      ])
      expect(measurement.adBlocksBeforeSearch, JSON.stringify(context)).toBe(0)
      expect(measurement.heroBlocksBeforeSearch, JSON.stringify(context)).toBe(0)
      // O slider é o primeiro elemento após o header
      expect(measurement.sliderTop, JSON.stringify(context)).toBeGreaterThanOrEqual(
        measurement.headerBottom,
      )
      // A pesquisa vem colada ao slider
      expect(measurement.searchTop, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.sliderBottom + 1,
      )
      // Criadores em foco vêm depois da pesquisa
      expect(measurement.breedersTop, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.searchBottom + 1,
      )
      // CTA do simulador vem depois dos criadores
      expect(measurement.ctaTop, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.breedersBottom + 1,
      )
      // Nota vem depois do CTA
      expect(measurement.noteTop, JSON.stringify(context)).toBeLessThanOrEqual(
        measurement.ctaBottom + 1,
      )
      expect(measurement.noteOverflow, JSON.stringify(context)).toBeLessThanOrEqual(1)
      await assertNoHorizontalOverflow(page, label)
    })
  }

  test('o CTA do simulador navega para /simulador-raca', async ({ page }) => {
    await page.goto('/')
    const cta = page.locator('[data-testid="home-simulator-cta"] a[href="/simulador-raca"]')
    await expect(cta).toContainText('Começar simulador')
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
