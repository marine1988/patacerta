/**
 * Empty state de imagens — nenhum card mostra imagem quebrada. @prod-safe
 *
 * Cobre as duas metades do requisito:
 *
 *  1. cards sem fotografia mostram o empty state editorial
 *     (`[data-testid="image-fallback"]`), nunca um `<img>` partido;
 *  2. quando uma URL de imagem existe mas falha (404, HTML, timeout, MinIO
 *     limpo), o `onError` troca para o empty state — aqui provocado a sério
 *     abortando todos os pedidos de tipo `image` no browser.
 *
 * Porque e' que o teste de falha forçada e' condicional: o catalogo publico
 * pode nao ter NENHUM servico com foto (producao, seeds minimalistas). Num
 * ambiente assim abortar imagens nao prova nada — o teste faz skip com a
 * razao escrita em vez de passar em vazio. Corre em stage com
 * `set -a; . ~/.hermes/profiles/coder/.env; set +a` (basic auth do Traefik).
 */

import { test, expect, type Page } from '../fixtures/test'
import { seedSkipReason } from '../fixtures/env'

/** Cards de servico da listagem publica (href canonico, estavel a mudancas de copy). */
const SERVICE_CARD = 'a[href^="/servicos/"]'

/**
 * Percorre a pagina para forçar o `loading="lazy"` das imagens dos cards.
 * Sem isto nenhuma <img> abaixo da dobra esta' carregada quando medimos — e
 * um contador a 0 por "ainda nao pediu" e' um falso negativo.
 */
async function loadLazyImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = 600
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(500)
}

/** Conta, dentro dos cards, <img> partidas (o icone que o utilizador viu). */
async function brokenCardImages(page: Page): Promise<number> {
  return page.evaluate((cardSelector) => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`${cardSelector} img`))
    // `complete && naturalWidth === 0` = o browser tentou carregar e falhou.
    return imgs.filter((img) => img.complete && img.naturalWidth === 0).length
  }, SERVICE_CARD)
}

/** Cards sem NADA na area da imagem (nem empty state nem <img>) = area branca. */
async function cardsWithoutVisual(page: Page): Promise<number> {
  return page.evaluate((cardSelector) => {
    const cards = Array.from(document.querySelectorAll(cardSelector))
    return cards.filter(
      (card) => !card.querySelector('[data-testid="image-fallback"]') && !card.querySelector('img'),
    ).length
  }, SERVICE_CARD)
}

/** Fotos reais carregadas nos cards (decide se o A/B da falha forçada faz sentido). */
async function loadedCardPhotos(page: Page): Promise<number> {
  return page.evaluate((cardSelector) => {
    return Array.from(document.querySelectorAll<HTMLImageElement>(`${cardSelector} img`)).filter(
      (img) => img.complete && img.naturalWidth > 0,
    ).length
  }, SERVICE_CARD)
}

test.describe('Empty state de imagens @prod-safe', () => {
  test('cards de servico nunca mostram imagem quebrada', async ({ page, caps }) => {
    test.skip(!caps.hasServices, seedSkipReason(caps, 'serviços publicados'))

    await page.goto('/pesquisar?tipo=servicos')
    await expect(page.locator(SERVICE_CARD).first()).toBeVisible({ timeout: 25_000 })

    // Assenta as imagens lazy antes de medir.
    await loadLazyImages(page)

    // Nenhuma <img> partida dentro dos cards (é o ícone que parecia bug).
    await expect.poll(() => brokenCardImages(page), { timeout: 20_000 }).toBe(0)

    // Toda a area de imagem de cada card tem algo lá dentro: foto ou empty state.
    await expect.poll(() => cardsWithoutVisual(page), { timeout: 10_000 }).toBe(0)

    // O empty state e' acessivel: `role="img"` com nome, ou decorativo.
    const a11yOk = await page.evaluate((cardSelector) => {
      const fallbacks = Array.from(
        document.querySelectorAll(`${cardSelector} [data-testid="image-fallback"]`),
      )
      return fallbacks.every((el) => {
        if (el.getAttribute('aria-hidden') === 'true') return true
        return el.getAttribute('role') === 'img' && !!el.getAttribute('aria-label')?.trim()
      })
    }, SERVICE_CARD)
    expect(a11yOk).toBe(true)
  })

  test('imagem que falha a carregar troca para o empty state (onError)', async ({ page, caps }) => {
    test.skip(!caps.hasServices, seedSkipReason(caps, 'serviços publicados'))

    await page.goto('/pesquisar?tipo=servicos')
    await expect(page.locator(SERVICE_CARD).first()).toBeVisible({ timeout: 25_000 })
    await loadLazyImages(page)

    const loadedBefore = await loadedCardPhotos(page)
    test.skip(
      loadedBefore === 0,
      'Nenhum card de serviço com foto neste ambiente — abortar imagens não provaria o onError (o empty state já é o estado inicial).',
    )

    // A partir daqui, TODO e qualquer pedido de imagem falha. Cobre 404,
    // resposta HTML e timeout de forma equivalente: o browser dispara
    // `error` em todos, que é o caminho que o componente trata.
    await page.route('**/*', (route) => {
      if (route.request().resourceType() === 'image') return route.abort()
      return route.continue()
    })

    await page.reload()
    await expect(page.locator(SERVICE_CARD).first()).toBeVisible({ timeout: 25_000 })
    await loadLazyImages(page)

    // O empty state aparece onde antes havia foto real.
    await expect(
      page.locator(`${SERVICE_CARD} [data-testid="image-fallback"]`).first(),
    ).toBeVisible({ timeout: 25_000 })

    // E o React removeu as <img> falhadas: zero icones de imagem partida.
    await expect.poll(() => brokenCardImages(page), { timeout: 20_000 }).toBe(0)
    await expect.poll(() => cardsWithoutVisual(page), { timeout: 10_000 }).toBe(0)
  })
})
