/**
 * Headers de segurança do DOCUMENTO servido pelo nginx — @prod-safe (read-only).
 *
 * LACUNA QUE ISTO FECHA (relatório do gate de segurança, lacuna nº7): o M-01
 * (HSTS) e o M-02 (CSP em enforcing) só tinham teste **estático**
 * (`src/nginx-security-headers.test.ts`, que lê o `nginx.conf.template` e
 * asserta strings no ficheiro). Nada provava que os headers chegam ao cliente
 * no documento servido — e há três formas de o config passar no teste estático
 * e o header não sair:
 *
 *   1. o template não é o que a imagem em produção usa (build/deploy antigo);
 *   2. o `add_header` está num `location` que não serve `/`;
 *   3. o envsubst do entrypoint parte o template (`$` mal escapado).
 *
 * `api-contract.spec.ts` cobre só o helmet da **API** (`/api/*`); o HTML do
 * SPA, o manifest e os assets são servidos pelo nginx e não tinham uma única
 * asserção E2E. Por isso este spec é novo em vez de uma extensão daquele: o
 * alvo é outro servidor (nginx vs Express) e a asserção é sobre o documento.
 * Também não entra no `seo-metadata.spec.ts` — esse spec precisa de um browser
 * para validar o `<head>` gerido pela app; aqui só se olham headers de resposta.
 *
 * ARMADILHA DO NGINX QUE ISTO TAMBÉM APANHA EM RUNTIME: um `add_header` dentro
 * de um `location` SUBSTITUI todos os herdados do `server` (não há merge), por
 * isso a CSP/HSTS estão repetidas em 4 locations no template. Se alguém
 * acrescentar uma location nova e se esquecer da repetição, o teste estático
 * falha — mas só se essa location lá estiver listada. Aqui prova-se no wire
 * em 3 das 4 locations de conteúdo (`/`, manifest e assets); a quarta
 * (`/patacerta-uploads/`, proxy do MinIO) precisa de um objeto existente e
 * fica coberta pelo teste estático.
 *
 * DIVERGÊNCIA ENTRE AMBIENTES (pergunta do card): NÃO há. O template é único e
 * não tem headers condicionais — a única variável é o `${ROBOTS_HEADER}`
 * (noindex no stage). A política HSTS/CSP é a mesma em local, stage e produção,
 * por isso o assert é o mesmo em todos. O que é configurável por ambiente é
 * apenas o **piso** de `max-age` (`E2E_HSTS_MIN_MAX_AGE`), para o dia em que a
 * política for encurtada de propósito: o teste tem de continuar a exigir um
 * HSTS *útil*, não a string exacta de hoje.
 *
 * LOCAL (`vite dev` / `vite preview`, que é o que o `e2e.yml` arranca em CI):
 * não há nginx nenhum pelo meio, logo estes headers não existem por desenho —
 * o spec faz skip com a razão explícita em vez de falhar (um skip honesto diz
 * que a asserção não correu; uma falha aqui seria falsa). A prova real vem dos
 * runs contra stage (`E2E (Stage)`) e produção (`--grep @prod-safe`). Para
 * correr localmente contra um servidor que replica o nginx:
 * `E2E_EXPECT_SECURITY_HEADERS=1`.
 */

import { test, expect, type APIResponse } from '@playwright/test'
import { TARGET_ENV } from '../fixtures/env'

/**
 * Piso de `max-age` do HSTS. O template publica `max-age=31536000` (1 ano);
 * o piso é deliberadamente mais baixo para não transformar uma decisão de
 * política (encurtar o HSTS) numa falha de CI — mas tem de continuar a ser um
 * HSTS com efeito prático. `max-age=0` (o valor que *desactiva* o HSTS, e o
 * que sai quando alguém copia o exemplo "para testar") falha sempre.
 */
const HSTS_MIN_MAX_AGE = Number(process.env.E2E_HSTS_MIN_MAX_AGE || 15_552_000) // 180 dias

/** Google Fonts: o `index.html` carrega-os, a CSP tem de os permitir (§8). */
const GOOGLE_FONTS_STYLE = 'https://fonts.googleapis.com'
const GOOGLE_FONTS_FONT = 'https://fonts.gstatic.com'

/**
 * `true` quando o alvo é servido por nginx (stage, produção) — ou quando o
 * operador força (`E2E_EXPECT_SECURITY_HEADERS=1`) contra um harness local.
 */
const NGINX_SERVED = TARGET_ENV !== 'local' || process.env.E2E_EXPECT_SECURITY_HEADERS === '1'

const SKIP_REASON =
  `Alvo '${TARGET_ENV}' não é servido por nginx (vite dev/preview não aplica os headers do ` +
  `nginx.conf.template). O HSTS/CSP do documento só existe atrás do nginx do Dockerfile — ` +
  `corre este spec contra stage (E2E (Stage)) ou produção (--grep @prod-safe), ou define ` +
  `E2E_EXPECT_SECURITY_HEADERS=1 contra um servidor que replique o template.`

/** Todos os valores de um header (o `headers()` colapsa duplicados). */
function headerValues(res: APIResponse, name: string): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === name.toLowerCase())
    .map((h) => h.value)
}

/** Valor do primeiro header com esse nome (`''` se ausente). */
function header(res: APIResponse, name: string): string {
  return res.headers()[name.toLowerCase()] ?? ''
}

/**
 * `max-age` do HSTS, em segundos. `null` quando o header não existe ou não
 * tem a directiva — os dois casos são falha, mas com mensagens diferentes.
 */
function hstsMaxAge(value: string): number | null {
  const match = /(?:^|;)\s*max-age\s*=\s*"?(\d+)"?/i.exec(value)
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) ? seconds : null
}

/** Directivas de uma política CSP (`default-src 'self'; ...`). */
function cspDirectives(policy: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) map.set(name.toLowerCase(), sources.join(' '))
  }
  return map
}

/**
 * Asserções comuns a todo o conteúdo servido pelo nginx. `label` entra nas
 * mensagens para o log do gate dizer qual dos caminhos falhou.
 *
 * Nota: usa `expect` (não `expect.soft`) de propósito — a primeira falha é a
 * informação útil; as seguintes seriam ruído da mesma causa (o header não sai).
 */
function expectNginxSecurityHeaders(res: APIResponse, label: string): void {
  // ── HSTS (M-01) ────────────────────────────────────────────────────────
  const hsts = headerValues(res, 'strict-transport-security')
  expect(
    hsts.length,
    `${label}: sem Strict-Transport-Security — o nginx não aplica o M-01 neste caminho`,
  ).toBeGreaterThan(0)

  const maxAge = hstsMaxAge(hsts[0]!)
  expect(
    maxAge,
    `${label}: HSTS sem max-age utilizável ('${hsts[0]}') — header inválido, o browser ignora-o`,
  ).not.toBeNull()
  expect(
    maxAge!,
    `${label}: HSTS com max-age=${maxAge}s, abaixo do piso de ${HSTS_MIN_MAX_AGE}s ` +
      `(max-age=0 desactiva o HSTS). Valor servido: '${hsts[0]}'`,
  ).toBeGreaterThanOrEqual(HSTS_MIN_MAX_AGE)

  // Diagnóstico, não assert: `includeSubDomains`/`preload` são decisões de
  // política que o card não manda travar aqui.
  console.log(
    `[security-headers] ${label}: hsts='${hsts.join(' | ')}' (${hsts.length} ocorrência(s))`,
  )

  // ── CSP em enforcing (M-02) ────────────────────────────────────────────
  const reportOnly = headerValues(res, 'content-security-policy-report-only')
  expect(
    reportOnly.length,
    `${label}: Content-Security-Policy-Report-Only presente ('${reportOnly.join(' | ')}') — ` +
      `o M-02 promoveu a CSP a enforcing; este header é o estado anterior e não bloqueia nada`,
  ).toBe(0)

  const csp = headerValues(res, 'content-security-policy')
  expect(csp.length, `${label}: sem Content-Security-Policy (enforcing)`).toBeGreaterThan(0)
  // Duas políticas no mesmo header são INTERSECTADAS pelo browser: um resto de
  // política antiga no `server` (ou um proxy a acrescentar uma) aperta a
  // política efectiva em silêncio — é a forma silenciosa de partir as Google
  // Fonts sem tocar na string do template.
  expect(
    csp.length,
    `${label}: ${csp.length} headers Content-Security-Policy na mesma resposta — o browser ` +
      `intersecta-os, logo a política efectiva não é a do template. Valores: ${csp.join(' | ')}`,
  ).toBe(1)

  const policy = csp[0]!
  expect(policy.toLowerCase(), `${label}: CSP ainda em modo report-only`).not.toContain(
    'report-only',
  )

  const directives = cspDirectives(policy)
  expect(directives.get('default-src'), `${label}: CSP sem 'default-src'`).toBeTruthy()
  expect(
    directives.get('default-src'),
    `${label}: 'default-src' devia ser 'self' (CSP '${policy}')`,
  ).toBe(`'self'`)

  // §8 da skill `patacerta`: o `index.html` carrega Google Fonts. Sem estas
  // directivas, promover a CSP a enforcing (M-02) parte as fontes e os estilos
  // externos — é exactamente o que o teste estático protege no ficheiro e este
  // protege no que é servido.
  const styleSrc = directives.get('style-src') ?? ''
  expect(styleSrc, `${label}: CSP sem 'style-src' (CSP '${policy}')`).toBeTruthy()
  expect(
    styleSrc,
    `${label}: 'style-src' não permite ${GOOGLE_FONTS_STYLE} — o Google Fonts do index.html ` +
      `fica bloqueado em enforcing (CSP '${policy}')`,
  ).toContain(GOOGLE_FONTS_STYLE)
  expect(
    styleSrc,
    `${label}: 'style-src' sem 'self' — o CSS do próprio site deixa de carregar`,
  ).toContain(`'self'`)

  const fontSrc = directives.get('font-src') ?? ''
  expect(fontSrc, `${label}: CSP sem 'font-src' (CSP '${policy}')`).toBeTruthy()
  expect(
    fontSrc,
    `${label}: 'font-src' não permite ${GOOGLE_FONTS_FONT} — os ficheiros woff2 do Google Fonts ` +
      `ficam bloqueados em enforcing (CSP '${policy}')`,
  ).toContain(GOOGLE_FONTS_FONT)

  // Clickjacking: `frame-ancestors` é a defesa que o `X-Frame-Options` não dá
  // em browsers modernos.
  expect(
    directives.get('frame-ancestors'),
    `${label}: CSP sem 'frame-ancestors' (CSP '${policy}')`,
  ).toBe(`'self'`)

  // ── Complementares (mesmo bloco de `add_header` no template) ───────────
  expect(header(res, 'x-content-type-options'), `${label}: sem X-Content-Type-Options`).toBe(
    'nosniff',
  )
  expect(header(res, 'x-frame-options'), `${label}: sem X-Frame-Options`).toBe('SAMEORIGIN')
  expect(header(res, 'referrer-policy'), `${label}: sem Referrer-Policy`).toBe(
    'strict-origin-when-cross-origin',
  )
  expect(header(res, 'permissions-policy'), `${label}: sem Permissions-Policy`).toContain(
    'geolocation=(self)',
  )
}

test.describe('Headers de segurança do documento (nginx) @prod-safe', () => {
  test.beforeEach(() => {
    test.skip(!NGINX_SERVED, SKIP_REASON)
  })

  test('GET / traz HSTS com max-age útil', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status(), 'GET / não devolveu 200').toBe(200)

    const hsts = headerValues(res, 'strict-transport-security')
    expect(
      hsts.length,
      'GET / sem Strict-Transport-Security: o nginx (M-01) não está a servir este header ' +
        '(build anterior ao M-01, ou o `add_header` caiu do `location /`)',
    ).toBeGreaterThan(0)

    const maxAge = hstsMaxAge(hsts[0]!)
    expect(maxAge, `HSTS inválido: '${hsts[0]}'`).not.toBeNull()
    expect(
      maxAge!,
      `HSTS com max-age=${maxAge}s < piso ${HSTS_MIN_MAX_AGE}s ('${hsts[0]}')`,
    ).toBeGreaterThanOrEqual(HSTS_MIN_MAX_AGE)
  })

  test('GET / traz CSP em enforcing (nunca Report-Only) a permitir Google Fonts', async ({
    request,
  }) => {
    const res = await request.get('/')
    expect(res.status(), 'GET / não devolveu 200').toBe(200)

    const reportOnly = headerValues(res, 'content-security-policy-report-only')
    expect(
      reportOnly.length,
      `CSP ainda em Report-Only ('${reportOnly.join(' | ')}') — M-02 não chegou a este alvo`,
    ).toBe(0)

    const csp = headerValues(res, 'content-security-policy')
    expect(csp.length, 'GET / sem Content-Security-Policy em enforcing').toBe(1)

    const directives = cspDirectives(csp[0]!)
    expect(directives.get('style-src') ?? '').toContain(GOOGLE_FONTS_STYLE)
    expect(directives.get('font-src') ?? '').toContain(GOOGLE_FONTS_FONT)
  })

  test('GET / traz o conjunto completo de headers de segurança', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status(), 'GET / não devolveu 200').toBe(200)
    expectNginxSecurityHeaders(res, 'GET /')
  })

  test('rota SPA profunda (/pesquisar) herda os headers do location /', async ({ request }) => {
    // O `location /` serve o `index.html` em qualquer rota da SPA
    // (`try_files ... /index.html`). Se a CSP/HSTS só estivesse no `index.html`
    // estático e não no location, esta rota saía sem eles.
    const res = await request.get('/pesquisar')
    expect(res.status(), 'GET /pesquisar não devolveu 200').toBe(200)
    expectNginxSecurityHeaders(res, 'GET /pesquisar')
  })

  test('manifest.webmanifest (location próprio) repete os headers', async ({ request }) => {
    // Regressão da armadilha do `add_header`: este location declara
    // `default_type` e (no template) o conjunto completo. Um location novo sem
    // a repetição serve conteúdo próprio sem CSP/HSTS.
    const res = await request.get('/manifest.webmanifest')
    expect(res.status(), 'GET /manifest.webmanifest não devolveu 200').toBe(200)
    expectNginxSecurityHeaders(res, 'GET /manifest.webmanifest')
  })

  test('assets do build (location de estáticos) repetem os headers', async ({ request }) => {
    // `og-image.svg` e os bundles saem desta location. É a que tem mais
    // `add_header` próprios (Cache-Control), logo a mais fácil de perder os de
    // segurança numa edição futura.
    const index = await request.get('/')
    expect(index.status(), 'GET / não devolveu 200').toBe(200)

    const html = await index.text()
    const assetPath = /<(?:script|link)[^>]+(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/.exec(
      html,
    )?.[1]
    expect(
      assetPath,
      'o index.html servido não referencia nenhum asset /assets/*.js|css — não é possível ' +
        'validar a location dos estáticos',
    ).toBeTruthy()

    const res = await request.get(assetPath!)
    expect(res.status(), `GET ${assetPath} não devolveu 200`).toBe(200)
    expectNginxSecurityHeaders(res, `GET ${assetPath}`)
  })
})
