import { test, expect, type Page } from '../fixtures/test'

/**
 * PATA-UI-1: o research mantém um respiro compacto em relação ao bloco
 * anterior, sem confundir esse intervalo com o hero que precede a homepage.
 */

type ViewportCase = {
  label: 'desktop' | 'mobile'
  viewport: { width: number; height: number }
  expectedPadding: number
}

const VIEWPORTS: readonly ViewportCase[] = [
  { label: 'desktop', viewport: { width: 1280, height: 900 }, expectedPadding: 16 },
  { label: 'mobile', viewport: { width: 390, height: 844 }, expectedPadding: 16 },
]

type ResearchMeasurement = {
  previousSectionBottom: number
  searchSectionTop: number
  sectionGap: number
  contentTop: number
  contentGap: number
  paddingTop: number
  paddingBottom: number
}

async function measureResearchGap(page: Page): Promise<ResearchMeasurement> {
  return page.evaluate(() => {
    const root = document.querySelector('main')?.firstElementChild
    const sections = root ? Array.from(root.querySelectorAll(':scope > section')) : []
    const search = sections.find((section) =>
      (section.textContent || '').includes('Encontrar criadores e serviços'),
    )
    const previous = search?.previousElementSibling
    const content = search?.querySelector('.eyebrow')
    if (!search || !previous || !content) {
      throw new Error('Homepage sem secção anterior/conteúdo de pesquisa')
    }

    const previousRect = previous.getBoundingClientRect()
    const searchRect = search.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    const inner = search.firstElementChild
    const styles = inner ? getComputedStyle(inner) : null

    return {
      previousSectionBottom: previousRect.bottom,
      searchSectionTop: searchRect.top,
      sectionGap: searchRect.top - previousRect.bottom,
      contentTop: contentRect.top,
      contentGap: contentRect.top - previousRect.bottom,
      paddingTop: styles ? Number.parseFloat(styles.paddingTop) : 0,
      paddingBottom: styles ? Number.parseFloat(styles.paddingBottom) : 0,
    }
  })
}

test.describe('Homepage research spacing @prod-safe', () => {
  for (const { label, viewport, expectedPadding } of VIEWPORTS) {
    test(`mantém o respiro da pesquisa compacto no ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await expect(page.getByText('Encontrar criadores e serviços', { exact: false })).toBeVisible()

      const measurement = await measureResearchGap(page)
      const context = { label, expectedPadding, ...measurement }

      // A secção é adjacente à anterior; qualquer respiro vem do padding
      // interno, não de uma quebra vertical do layout.
      expect(measurement.sectionGap, JSON.stringify(context)).toBeGreaterThanOrEqual(0)
      expect(measurement.sectionGap, JSON.stringify(context)).toBeLessThanOrEqual(2)
      expect(measurement.paddingTop, JSON.stringify(context)).toBeCloseTo(expectedPadding, 0)
      expect(measurement.paddingBottom, JSON.stringify(context)).toBeCloseTo(expectedPadding, 0)
      expect(measurement.contentGap, JSON.stringify(context)).toBeGreaterThanOrEqual(
        expectedPadding,
      )
      expect(measurement.contentGap, JSON.stringify(context)).toBeLessThanOrEqual(
        expectedPadding + 4,
      )
    })
  }
})
