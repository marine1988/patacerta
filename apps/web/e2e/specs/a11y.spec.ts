/**
 * Acessibilidade (a11y) — @prod-safe (read-only).
 *
 * Sem cobertura antes desta suite. Barreiras de a11y não aparecem em
 * `typecheck` nem em testes funcionais, e são obrigação legal (DL 83/2018
 * para sítios públicos; RGPD/UE a11y act para serviços digitais).
 *
 * Não substitui uma auditoria com axe-core, mas trava as regressões mais
 * comuns e mais baratas de detectar: h1 ausente/duplicado, imagens sem
 * `alt`, controlos sem nome acessível, labels desassociados e excepções
 * de JS que deixam a página morta para leitores de ecrã.
 */

import { test, expect, type Page } from '../fixtures/test'

const A11Y_ROUTES = [
  { path: '/', name: 'homepage' },
  { path: '/pesquisar', name: 'pesquisa criadores' },
  { path: '/pesquisar?tipo=servicos', name: 'pesquisa serviços' },
  { path: '/simulador-raca', name: 'simulador de raça' },
  { path: '/termos', name: 'termos' },
  { path: '/politica-privacidade', name: 'política de privacidade' },
  { path: '/entrar', name: 'entrar' },
  { path: '/registar', name: 'registar' },
  { path: '/uma-rota-inexistente-xyz', name: '404' },
]

/** Espera que a app tenha renderizado conteúdo real (SPA + lazy chunks). */
async function waitForRender(page: Page): Promise<void> {
  await page.locator('main').first().waitFor({ state: 'attached', timeout: 20_000 })
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 20_000 })
}

test.describe('Acessibilidade @prod-safe', () => {
  for (const route of A11Y_ROUTES) {
    test(`estrutura acessível em ${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path)
      await waitForRender(page)

      // 1) Idioma do documento declarado (leitores de ecrã + tradução).
      const lang = await page.locator('html').getAttribute('lang')
      expect(lang, 'html[lang] em falta').toMatch(/^pt(-PT)?$/i)

      // 2) Um único landmark <main> e visível.
      await expect(page.locator('main')).toHaveCount(1)
      await expect(page.locator('main').first()).toBeVisible()

      // 3) Exatamente um h1 — a hierarquia de headings é o índice de
      //    navegação dos leitores de ecrã.
      const h1s = await page.locator('h1').allTextContents()
      expect(h1s.length, `h1 duplicado (${h1s.length}) em ${route.path}: ${h1s.join(' | ')}`).toBe(
        1,
      )
      expect(h1s[0]!.trim().length).toBeGreaterThan(0)

      // 4) Todas as imagens têm atributo alt (vazio = decorativa explícita).
      const imgsWithoutAlt = await page.evaluate(
        () => [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
      )
      expect(imgsWithoutAlt, `${imgsWithoutAlt} <img> sem atributo alt em ${route.path}`).toBe(0)

      // 5) Nenhum controlo interactivo sem nome acessível.
      const unnamed = await page.evaluate(() => {
        const name = (el: Element): string => {
          const aria = el.getAttribute('aria-label')?.trim()
          if (aria) return aria
          const labelled = el.getAttribute('aria-labelledby')
          if (labelled) {
            const ref = document.getElementById(labelled.split(/\s+/)[0]!)
            if (ref?.textContent?.trim()) return ref.textContent.trim()
          }
          const title = el.getAttribute('title')?.trim()
          if (title) return title
          return (el.textContent ?? '').trim()
        }
        return [...document.querySelectorAll('a[href], button')]
          .filter((el) => !el.hasAttribute('disabled'))
          .filter((el) => el.getAttribute('aria-hidden') !== 'true')
          .filter((el) => !el.closest('[aria-hidden="true"]'))
          .filter((el) => name(el).length === 0)
          .map((el) => `${el.tagName.toLowerCase()}[${el.className.toString().slice(0, 40)}]`)
      })
      expect(
        unnamed,
        `controlos sem nome acessível em ${route.path}: ${unnamed.join(', ')}`,
      ).toEqual([])
    })
  }

  test('formulário de login tem labels associados', async ({ page }) => {
    await page.goto('/entrar')

    // getByLabel só resolve se o label estiver ligado (htmlFor/id ou wrapper).
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible({ timeout: 15_000 })
    // `exact` é obrigatório: o botão "Mostrar palavra-passe" tem esse texto
    // no aria-label e colide com o campo (strict mode violation).
    await expect(page.getByLabel('Palavra-passe', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()

    // Navegação por teclado: o primeiro Tab alcança um alvo focável real.
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      isBody: document.activeElement === document.body,
    }))
    expect(focused.isBody, 'o primeiro Tab não focou nenhum elemento').toBe(false)
    expect(focused.tag).not.toBe('')
  })

  test('formulário de registo tem labels associados e checkbox acessível', async ({ page }) => {
    await page.goto('/registar')

    await expect(page.getByLabel('Nome')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Apelido')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Palavra-passe', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Confirmar palavra-passe')).toBeVisible()
    // Checkbox dos termos tem de ser rotulada (é o gate do submit).
    await expect(page.getByLabel(/Li e aceito os/i)).toBeVisible()
  })

  test('o h1 é o primeiro heading da página (não há h2 antes do h1)', async ({ page }) => {
    await page.goto('/pesquisar')
    await waitForRender(page)

    const firstHeading = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      const visible = headings.find((h) => (h as HTMLElement).offsetParent !== null)
      return visible?.tagName ?? ''
    })
    expect(firstHeading).toBe('H1')
  })

  test('as rotas públicas não lançam excepções de JS não tratadas', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    for (const route of A11Y_ROUTES) {
      await page.goto(route.path)
      await waitForRender(page)
    }

    expect(pageErrors, `excepções de JS não tratadas: ${pageErrors.join(' || ')}`).toEqual([])
  })
})
