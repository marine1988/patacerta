/**
 * SEO / metadata — @prod-safe (read-only).
 *
 * Sem cobertura antes desta suite. Riscos reais que estes testes travam:
 *  - `VITE_PUBLIC_URL` mal definido → stage publica canonical/`og:url` a
 *    apontar para produção (conteúdo duplicado + canibalização de SERP).
 *  - Página nova sem `usePageMeta` → herda title/description/canonical do
 *    `index.html` (ficam todos a apontar para `/`).
 *  - `noIndex` a faltar em páginas privadas → área pessoal/login indexados.
 *  - JSON-LD inválido ou duplicado → rich results perdidos em silêncio.
 *
 * NOTA IMPORTANTE (evita flakes): o `usePageMeta` corre em `useEffect`, ou
 * seja, DEPOIS do evento `load`. Ler `getAttribute()` uma única vez logo
 * após `goto()` apanha os valores estáticos do `index.html`. Todas as
 * asserções aqui usam `expect`/`expect.poll` (auto-retry) para esperar que
 * o head seja realmente gerido pela app — `waitForHeadManaged()` centraliza
 * essa espera.
 */

import { test, expect, type Page } from '../fixtures/test'
import { EXPECTED_PUBLIC_URL, TARGET_ENV } from '../fixtures/env'
import { API_BASE_URL } from '../fixtures/demo-data'

interface RouteExpectation {
  path: string
  /** Substring obrigatória no `<title>` (o sufixo " — PataCerta" é adicionado). */
  title: string
  /** Path canónico esperado (sem query string). */
  canonicalPath: string
  /** true = a página tem de declarar `noindex`. */
  noIndex?: boolean
  /** Páginas privadas usam descrições curtas de propósito (não são para SERP). */
  minDescription?: number
}

const PUBLIC_ROUTES: RouteExpectation[] = [
  {
    path: '/',
    title: 'Criadores Verificados e Serviços para Cães em Portugal',
    canonicalPath: '/',
  },
  {
    path: '/pesquisar',
    title: 'Pesquisar Criadores Verificados em Portugal',
    canonicalPath: '/pesquisar',
  },
  {
    path: '/pesquisar?tipo=servicos',
    title: 'Pesquisar Serviços para Cães em Portugal',
    canonicalPath: '/pesquisar',
  },
  {
    path: '/simulador-raca',
    title: 'Simulador de Raça — Encontrar o cão ideal',
    canonicalPath: '/simulador-raca',
  },
  { path: '/termos', title: 'Termos e Condições', canonicalPath: '/termos' },
  {
    path: '/politica-privacidade',
    title: 'Política de Privacidade',
    canonicalPath: '/politica-privacidade',
  },
  {
    path: '/perguntas-frequentes',
    title: 'Perguntas Frequentes',
    canonicalPath: '/perguntas-frequentes',
  },
  {
    path: '/termos-pagamento',
    title: 'Termos de Pagamento — Destaques no Simulador',
    canonicalPath: '/termos-pagamento',
  },
  {
    path: '/entrar',
    title: 'Entrar',
    canonicalPath: '/entrar',
    noIndex: true,
    minDescription: 15,
  },
  {
    path: '/registar',
    title: 'Criar conta',
    canonicalPath: '/registar',
    noIndex: true,
    minDescription: 15,
  },
]

const HEAD_TIMEOUT = 20_000

/**
 * Perfis oficiais (PATA-SOCIAL-2). A fonte única em produção é
 * `src/lib/social.ts`; aqui replica-se o contrato de propósito — um handle
 * errado no `sameAs` desassocia os perfis do domínio no Google sem falhar
 * nenhum teste visual.
 */
const EXPECTED_SOCIAL_URLS = [
  'https://www.instagram.com/patacerta.pt/',
  'https://www.youtube.com/@patacerta-pt',
  'https://www.tiktok.com/@patacerta.pt',
]

/**
 * Espera que o `<title>` seja o da app (e não o estático do `index.html`).
 *
 * Sentinela escolhido com cuidado: o `index.html` já traz `<title>`,
 * `og:url` e `<link rel=canonical>` estáticos, por isso NENHUM desses serve
 * para detectar hidratação — no `/` o `og:url` estático é igual ao runtime.
 * O título final (sufixo " — PataCerta" no fim) é sempre diferente do
 * estático, porque o `index.html` usa o formato "PataCerta — …". Quando o
 * título está certo, todas as outras meta tags foram escritas no mesmo efeito.
 */
async function waitForHeadManaged(page: Page, expectedTitle: string): Promise<void> {
  await expect
    .poll(async () => page.title(), {
      timeout: HEAD_TIMEOUT,
      message: `o título não ficou '${expectedTitle}' (head ainda estático?)`,
    })
    .toBe(expectedTitle)
}

test.describe('SEO / metadata @prod-safe', () => {
  for (const route of PUBLIC_ROUTES) {
    const expectedTitle = `${route.title} — PataCerta`

    test(`meta tags corretas em ${route.path}`, async ({ page }) => {
      await page.goto(route.path)
      await waitForHeadManaged(page, expectedTitle)

      const metaContent = (selector: string) =>
        page.locator(selector).first().getAttribute('content')
      const canonicalHref = () => page.locator('link[rel="canonical"]').first().getAttribute('href')

      // 1) <title> próprio — nunca o do index.html por omissão de usePageMeta.
      await expect(page).toHaveTitle(new RegExp(escapeRegExp(route.title)), {
        timeout: HEAD_TIMEOUT,
      })
      expect(await page.title()).toBe(expectedTitle)

      // 2) description presente e com comprimento útil para SERP.
      //    Lido com expect.poll: o index.html tem description ESTÁTICA, logo uma
      //    leitura única pode apanhar o valor do ficheiro em vez do da app.
      const minDescription = route.minDescription ?? 40
      await expect
        .poll(() => metaContent('meta[name="description"]'), {
          timeout: HEAD_TIMEOUT,
          message: `description de '${route.path}' não ficou com ${minDescription}-300 chars`,
        })
        .toMatch(new RegExp(`^[\\s\\S]{${minDescription},300}$`))

      // 3) canonical absoluto, sem query string, no domínio esperado.
      if (EXPECTED_PUBLIC_URL) {
        const expectedCanonical = `${EXPECTED_PUBLIC_URL}${route.canonicalPath}`
        await expect
          .poll(() => canonicalHref(), {
            timeout: HEAD_TIMEOUT,
            message:
              `canonical de '${route.path}' não ficou '${expectedCanonical}' ` +
              `(VITE_PUBLIC_URL mal definido em '${TARGET_ENV}'?)`,
          })
          .toBe(expectedCanonical)

        await expect
          .poll(() => metaContent('meta[property="og:url"]'), { timeout: HEAD_TIMEOUT })
          .toBe(expectedCanonical)
      } else {
        // Dev local: só se exige que seja absoluto e sem query string.
        await expect.poll(() => canonicalHref(), { timeout: HEAD_TIMEOUT }).toMatch(/^https?:\/\//)
        const canonical = await canonicalHref()
        await expect
          .poll(() => metaContent('meta[property="og:url"]'), { timeout: HEAD_TIMEOUT })
          .toBe(canonical)
      }
      expect(
        await canonicalHref(),
        'canonical de uma SPA não pode propagar query string',
      ).not.toContain('?')

      // 4) Open Graph coerente com o title.
      await expect
        .poll(() => metaContent('meta[property="og:title"]'), { timeout: HEAD_TIMEOUT })
        .toBe(expectedTitle)
      await expect(page.locator('meta[property="og:type"]').first()).toHaveAttribute(
        'content',
        /website|article/,
      )

      // 5) robots: noindex obrigatório nas páginas privadas.
      const robotsPoll = expect
        .poll(() => metaContent('meta[name="robots"]'), { timeout: HEAD_TIMEOUT })
        .not.toBeNull()
      await robotsPoll
      if (route.noIndex) {
        await expect.poll(() => metaContent('meta[name="robots"]')).toContain('noindex')
      } else {
        await expect.poll(() => metaContent('meta[name="robots"]')).not.toContain('noindex')
      }
    })
  }

  test('JSON-LD global (Organization + WebSite) é válido', async ({ page }) => {
    await page.goto('/')

    const siteScripts = page.locator(
      'script[type="application/ld+json"][data-managed="patacerta-site"]',
    )
    await expect(siteScripts).toHaveCount(2, { timeout: HEAD_TIMEOUT })

    const scripts = await siteScripts.allTextContents()
    const blocks = scripts.map((raw) => JSON.parse(raw) as Record<string, unknown>)

    for (const block of blocks) {
      expect(block['@context']).toBe('https://schema.org')
      expect(block['@type'], 'JSON-LD sem @type').toBeTruthy()
    }

    const byType = (type: string) =>
      blocks.find((b) => JSON.stringify(b['@type'] ?? '').includes(type))
    const organization = byType('Organization')
    const website = byType('WebSite')
    expect(organization, 'JSON-LD Organization em falta').toBeTruthy()
    expect(website, 'JSON-LD WebSite em falta').toBeTruthy()

    expect(organization!.name).toBe('PataCerta')
    expect(website!.name).toBe('PataCerta')
    expect(website!.inLanguage).toBe('pt-PT')

    // URLs absolutas e no domínio canónico (não pode apontar para localhost).
    if (EXPECTED_PUBLIC_URL) {
      expect(String(organization!.url).startsWith(EXPECTED_PUBLIC_URL)).toBe(true)
      expect(String(website!.url).startsWith(EXPECTED_PUBLIC_URL)).toBe(true)
    }
  })

  /**
   * PATA-SOCIAL-2 — os perfis oficiais têm de estar no `Organization`
   * JSON-LD (`sameAs`), para Google e LLMs ligarem o domínio às contas.
   *
   * O nó é injectado em runtime pelo `<SiteJsonLd />` (`App.tsx`), por isso
   * `curl` ao HTML só vê o comentário do `index.html`: a prova tem de ser no
   * DOM, depois de o React correr.
   *
   * Lê **todos** os `script[type="application/ld+json"]` da página (não só os
   * `data-managed="patacerta-site"`): um `Organization` estático esquecido no
   * `index.html` — ou um segundo injector — apareceria aqui como nó
   * duplicado a divergir do runtime, que é exactamente o defeito que este
   * teste tem de apanhar.
   */
  test('Organization JSON-LD expõe os 3 perfis oficiais em sameAs', async ({ page }) => {
    // O injector vive no layout (App.tsx), logo o nó tem de aparecer em
    // qualquer rota — não só na Home.
    for (const path of ['/', '/pesquisar', '/termos']) {
      await page.goto(path)
      await expect(
        page.locator('script[type="application/ld+json"][data-managed="patacerta-site"]'),
        `SiteJsonLd não injectou os nós globais em ${path}`,
      ).toHaveCount(2, { timeout: HEAD_TIMEOUT })

      const raws = await page.locator('script[type="application/ld+json"]').allTextContents()
      const blocks = raws
        .filter((raw) => raw.trim().length > 0)
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      expect(blocks.length, `nenhum bloco JSON-LD em ${path}`).toBeGreaterThan(0)

      const organizations = blocks.filter((block) => {
        const type = block['@type']
        return Array.isArray(type) ? type.includes('Organization') : type === 'Organization'
      })
      expect(
        organizations,
        `esperado exactamente 1 nó Organization em ${path}; encontrados ${organizations.length}`,
      ).toHaveLength(1)

      expect(
        organizations[0]!.sameAs,
        `sameAs do Organization em ${path} não corresponde aos perfis oficiais`,
      ).toEqual(EXPECTED_SOCIAL_URLS)
      expect(organizations[0]!.name).toBe('PataCerta')

      if (EXPECTED_PUBLIC_URL) {
        expect(String(organizations[0]!.url).startsWith(EXPECTED_PUBLIC_URL)).toBe(true)
      }
    }

    // Fonte única: o `sameAs` e os hrefs do footer têm de ser a MESMA lista
    // (os dois vêm de `SOCIAL_LINKS`). Se alguém duplicar os URLs num dos
    // lados, a igualdade quebra aqui — não no consumidor final.
    //
    // O footer vive no `MainLayout`, DENTRO do `<Suspense>` (`App.tsx`); no
    // `/termos` o chunk lazy suspende e o layout só monta depois (~50-160 ms
    // a seguir aos JSON-LD globais, que estão FORA do Suspense). `evaluateAll`
    // não tem auto-wait: ler aqui logo após o `goto` devolve 0 links e falha
    // 3/3 contra alvos remotos. Esperar pela contagem (que faz retry) é a
    // sincronização correcta — não enfraquece o assert.
    const footerLinks = page.locator('[data-testid="footer-social"] a')
    await expect(footerLinks).toHaveCount(EXPECTED_SOCIAL_URLS.length, { timeout: HEAD_TIMEOUT })
    const footerHrefs = await footerLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    )
    expect(footerHrefs.length, 'footer sem os links sociais').toBe(EXPECTED_SOCIAL_URLS.length)

    const sameAsInDom = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      for (const script of scripts) {
        const raw = script.textContent?.trim()
        if (!raw) continue
        const parsed = JSON.parse(raw) as Record<string, unknown>
        if (parsed['@type'] === 'Organization') return parsed.sameAs
      }
      return null
    })
    expect(sameAsInDom).toEqual(footerHrefs)
  })

  test('JSON-LD de breadcrumbs existe em /pesquisar', async ({ page }) => {
    await page.goto('/pesquisar')

    const pageScripts = page.locator(
      'script[type="application/ld+json"][data-managed="patacerta-page"]',
    )
    await expect(pageScripts.first()).toBeAttached({ timeout: HEAD_TIMEOUT })

    const blocks = (await pageScripts.allTextContents()).map(
      (raw) => JSON.parse(raw) as Record<string, unknown>,
    )
    const breadcrumb = blocks.find((b) => b['@type'] === 'BreadcrumbList')
    expect(breadcrumb, 'BreadcrumbList em falta em /pesquisar').toBeTruthy()

    const items = breadcrumb!.itemListElement as Array<{
      position: number
      name: string
      item: string
    }>
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0]!.position).toBe(1)
    expect(items[0]!.name).toBe('Início')

    // Os URLs dos breadcrumbs têm de ser absolutos no domínio canónico.
    if (EXPECTED_PUBLIC_URL) {
      for (const item of items) {
        expect(
          item.item.startsWith(EXPECTED_PUBLIC_URL),
          `breadcrumb fora do domínio: ${item.item}`,
        ).toBe(true)
      }
    }
  })

  test('JSON-LD de página é limpo ao navegar (sem duplicados)', async ({ page }) => {
    await page.goto('/pesquisar')
    const pageScripts = page.locator(
      'script[type="application/ld+json"][data-managed="patacerta-page"]',
    )
    await expect(pageScripts.first()).toBeAttached({ timeout: HEAD_TIMEOUT })

    // Navegação client-side: o cleanup do usePageMeta limpa o conteúdo do
    // bloco da página anterior (senão acumulavam breadcrumbs de todas as
    // visitas). Desde o refactor do SEO o elemento é lazy-init e NUNCA é
    // removido do DOM — apenas o `textContent` é limpo (elimina o bug
    // "Failed to execute removeChild"). Por isso o assert é sobre o conteúdo
    // ficar vazio, não sobre o elemento desaparecer.
    await page
      .getByRole('link', { name: /PataCerta/i })
      .first()
      .click()
    await expect(page).toHaveURL(/\/$/)
    await expect(pageScripts).toHaveCount(1, { timeout: HEAD_TIMEOUT })
    await expect
      .poll(() => pageScripts.first().evaluate((el) => (el as HTMLScriptElement).textContent))
      .toBe('')

    // E os globais continuam exatamente 2 (sem duplicar a cada navegação).
    await expect(
      page.locator('script[type="application/ld+json"][data-managed="patacerta-site"]'),
    ).toHaveCount(2)
  })

  test('robots.txt bloqueia áreas privadas e aponta o sitemap', async ({ request }) => {
    const res = await request.get(`${EXPECTED_PUBLIC_URL ?? ''}/robots.txt`)
    expect(res.status()).toBe(200)

    const body = await res.text()
    expect(body).toContain('User-agent: *')
    for (const disallowed of ['/admin', '/area-pessoal', '/publicar']) {
      expect(body, `robots.txt devia bloquear ${disallowed}`).toContain(disallowed)
    }
    expect(body).toMatch(/Sitemap:\s*https?:\/\//i)

    // O host do `Sitemap:` TEM de ser o deste ambiente (PATA-BUG-9): o
    // ficheiro é estático e é copiado para a imagem de todos os ambientes,
    // por isso um host literal fazia o stage anunciar a sitemap de produção
    // (exactamente a classe do PATA-BUG-7). O assert de forma acima sozinho
    // não apanha isso — foi o que deixou o defeito invisível.
    //
    // O `__PUBLIC_URL__` do template é resolvido no build/dev pelo plugin
    // `patacerta:public-url` (`apps/web/vite.config.ts`), que trata também do
    // `llms.txt`; se ele escapar para o que é servido, o crawl aponta para um
    // caminho literal inválido.
    expect(body, 'robots.txt com o placeholder por resolver').not.toContain('__PUBLIC_URL__')

    const sitemapLine = body.match(/^[ \t]*Sitemap:[ \t]*(\S+)[ \t]*$/im)
    expect(sitemapLine, 'robots.txt sem linha `Sitemap:`').not.toBeNull()
    const sitemapUrl = sitemapLine![1]!
    expect(sitemapUrl.endsWith('/sitemap.xml'), `sitemap inesperada: ${sitemapUrl}`).toBe(true)
    if (EXPECTED_PUBLIC_URL) {
      expect(
        sitemapUrl.startsWith(`${EXPECTED_PUBLIC_URL}/`),
        `robots.txt aponta a sitemap de outro domínio: ${sitemapUrl} (esperado ${EXPECTED_PUBLIC_URL})`,
      ).toBe(true)
    }
  })

  test('llms.txt aponta ao domínio deste ambiente', async ({ request }) => {
    const res = await request.get(`${EXPECTED_PUBLIC_URL ?? ''}/llms.txt`)
    expect(res.status()).toBe(200)
    expect((res.headers()['content-type'] ?? '').toLowerCase()).toContain('text/plain')

    const body = await res.text()
    // Forma mínima do `llms.txt` (llmstxt.org): H1 com o nome do projecto.
    expect(body, 'llms.txt sem o H1 do projecto').toMatch(/^#\s+PataCerta/m)

    // PATA-BUG-10: `public/llms.txt` é estático e é copiado tal-e-qual para a
    // imagem de TODOS os ambientes. Com URLs absolutas literais lá dentro, o
    // `llms.txt` servido em stage anunciava o domínio de PRODUÇÃO — mesma
    // classe do PATA-BUG-7 (`<loc>` do sitemap) e do PATA-BUG-9 (robots.txt),
    // num artefacto que a suite não cobria de todo.
    //
    // O `__PUBLIC_URL__` do template é resolvido no build/dev pelo plugin
    // `patacerta:public-url` (`apps/web/vite.config.ts`); se escapar para o que
    // é servido, os LLMs ficam a citar um caminho literal inválido.
    expect(body, 'llms.txt com o placeholder por resolver').not.toContain('__PUBLIC_URL__')

    const urls = [...body.matchAll(/https?:\/\/[^\s<>()[\]"'`]+/g)].map((m) => m[0])
    expect(urls.length, 'llms.txt sem nenhuma URL absoluta').toBeGreaterThan(0)

    if (EXPECTED_PUBLIC_URL) {
      for (const url of urls) {
        expect(
          url.startsWith(EXPECTED_PUBLIC_URL),
          `llms.txt com URL de outro domínio: ${url} (esperado ${EXPECTED_PUBLIC_URL})`,
        ).toBe(true)
      }
    } else {
      // Em local o alvo é `localhost` e o `VITE_PUBLIC_URL` aponta a produção
      // de propósito (fallback de `src/lib/seo.ts`), logo não se assere o host
      // — assere-se que o ficheiro não MISTURA domínios (um link de outro
      // ambiente no meio seria defeito mesmo sem saber qual é o esperado).
      const origins = new Set(urls.map((url) => new URL(url).origin))
      expect(origins.size, `llms.txt mistura domínios: ${[...origins].join(', ')}`).toBe(1)
    }
  })

  /**
   * Onde pedir o `/sitemap.xml`.
   *
   * Em stage/produção o host canónico tem nginx, que proxya `/sitemap.xml`
   * para a API. No stack local do `e2e.yml` o web é `vite preview` (sem proxy):
   * pedir `/sitemap.xml` ali devolve o `index.html` da SPA (`text/html`), não o
   * XML da API — era esse o falso vermelho do run 43206671403. Sem host
   * canónico conhecido (`EXPECTED_PUBLIC_URL === null` ⇒ local), o sitemap
   * pede-se à API, que é quem o gera.
   */
  const SITEMAP_URL = EXPECTED_PUBLIC_URL
    ? `${EXPECTED_PUBLIC_URL}/sitemap.xml`
    : `${API_BASE_URL.replace(/\/api$/, '')}/sitemap.xml`

  test('sitemap.xml é XML válido e só contém URLs do domínio canónico', async ({ request }) => {
    const res = await request.get(SITEMAP_URL)
    expect(res.status(), `${SITEMAP_URL} → ${await rateLimitHint(res)}`).toBe(200)
    expect((res.headers()['content-type'] ?? '').toLowerCase()).toContain('xml')

    const xml = await res.text()
    expect(xml).toContain('<urlset')
    expect(xml).toContain('</urlset>')

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.trim())
    expect(locs.length).toBeGreaterThan(3)

    for (const loc of locs) {
      expect(loc.startsWith('http'), `URL não absoluta no sitemap: ${loc}`).toBe(true)
    }

    // Um sitemap NUNCA pode misturar ambientes (PATA-BUG-7/9/10): todas as
    // `<loc>` partilham a mesma origem.
    const origins = [...new Set(locs.map((l) => new URL(l).origin))]
    expect(origins, `sitemap mistura domínios: ${origins.join(', ')}`).toHaveLength(1)

    if (EXPECTED_PUBLIC_URL) {
      for (const loc of locs) {
        expect(
          loc.startsWith(EXPECTED_PUBLIC_URL),
          `sitemap com URL de outro domínio: ${loc}`,
        ).toBe(true)
      }
    } else {
      // Sem host canónico configurado (local, sem proxy): o sitemap tem de
      // anunciar o host do PRÓPRIO stack — loopback. Anunciar o domínio de
      // outro ambiente é exactamente o defeito que este assert trava.
      const host = new URL(origins[0]!).hostname
      expect(
        ['localhost', '127.0.0.1', '[::1]'],
        `sitemap do stack local anuncia '${host}' — devia anunciar o host que o serve (${new URL(SITEMAP_URL).origin})`,
      ).toContain(host)
    }
    expect(locs.some((l) => l.endsWith('/pesquisar'))).toBe(true)
  })

  test('noIndex é reposto ao navegar de uma página privada para pública', async ({ page }) => {
    await page.goto('/entrar')
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      'content',
      /noindex/,
      { timeout: HEAD_TIMEOUT },
    )

    // Navegação client-side (SPA) → o cleanup do usePageMeta tem de repor
    // o robots do index.html, senão a homepage fica noindex para sempre.
    await page
      .getByRole('link', { name: /PataCerta/i })
      .first()
      .click()
    await expect(page).toHaveURL(/\/$/)
    await expect
      .poll(async () => page.locator('meta[name="robots"]').first().getAttribute('content'))
      .not.toContain('noindex')
  })

  test('sitemap acessível na raiz do site (proxy nginx → API)', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL.replace(/\/api$/, '')}/sitemap.xml`)
    expect(res.status(), await rateLimitHint(res)).toBe(200)
    expect(await res.text()).toContain('<urlset')
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Mensagem de diagnóstico quando a resposta é 429. Sondar produção a partir
 * de um único IP consome o balde de 200 pedidos/15 min (`apiRateLimit`), pelo
 * que um 429 no meio da suite é ambiente, não regressão — mas tem de ser
 * visível, com o instante de reset, em vez de um "expected 200, got 429" seco.
 */
async function rateLimitHint(res: {
  status(): number
  headers(): Record<string, string>
}): Promise<string> {
  if (res.status() !== 429) return ''
  const reset = res.headers()['x-ratelimit-reset']
  const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : 'desconhecido'
  return `RATE LIMIT (429) do ambiente atingido — reset em ${resetAt}. Ver card PATA-BUG-3.`
}
