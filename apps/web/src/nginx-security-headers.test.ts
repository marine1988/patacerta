/**
 * Guarda de regressao do `nginx.conf.template` (card PATA-BUG-4).
 *
 * Porque e' que isto e' um teste e nao um comentario: em nginx, um
 * `add_header` dentro de um bloco `location` SUBSTITUI todos os
 * `add_header` herdados do `server` — nao ha' merge. Basta alguem
 * acrescentar um `location` novo (ou um `add_header` num bloco que servia
 * conteudo proprio) para o HTML voltar a ser embutivel num iframe — e nem
 * o E2E de SEO nem o `api-contract.spec.ts` se queixam, porque so' olham
 * para a API. Este teste le' o template real e falha nesse caso.
 *
 * Só a parte de "quem tem de ter os headers" e' testada aqui; o
 * comportamento em runtime (nginx a servir mesmo os headers) foi validado
 * contra um nginx real no card PATA-BUG-4.
 *
 * Fonte da verdade dos valores: o bloco "Headers de seguranca" no topo do
 * `apps/web/nginx.conf.template`. Se mudares la', muda aqui.
 */

import { describe, expect, it } from 'vitest'

// `?raw` — o Vite transforma o ficheiro num import de string (evita
// `node:fs`, que o `apps/web` nao tem como dependencia de tipos).
import template from '../nginx.conf.template?raw'

/** Headers que TODO o conteudo servido pelo nginx tem de trazer. */
const SECURITY_HEADERS = [
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header X-Frame-Options "SAMEORIGIN" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  'add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;',
  "add_header Content-Security-Policy-Report-Only \"default-src 'self'; img-src 'self' data: https:; frame-ancestors 'self'\" always;",
]

/**
 * Em stage o nginx injecta o `X-Robots-Tag` via envsubst (`ROBOTS_HEADER`).
 * Como e' um `add_header` do `server`, qualquer `location` que declare os
 * seus proprios headers perde-o — dai' o placeholder ser repetido.
 */
const ROBOTS_HEADER = '${ROBOTS_HEADER}'

/**
 * Locations que respondem por proxy do API: quem envia os headers de
 * seguranca e' o helmet (`apps/api/src/index.ts`). Repeti-los aqui punha
 * dois `Referrer-Policy`/`Permissions-Policy` contraditorios na MESMA
 * resposta (`no-referrer` do helmet vs `strict-origin-when-cross-origin`).
 */
const API_OWNED = ['/api/', 'sitemap.xml', '/criador/', '/servicos/', '@spa_fallback']

/** Numero de `location` no template. Canario: se o parser partir, isto cai. */
const LOCATION_COUNT = 9

type Block = { header: string; body: string }

/** Remove comentarios `# ...` (os braces em texto nao contam). */
const stripComments = (line: string): string => {
  const i = line.indexOf('#')
  return i === -1 ? line : line.slice(0, i)
}

/** Extrai os blocos `location` (header + corpo) do template. */
function parseLocations(src: string): Block[] {
  const blocks: Block[] = []
  let depth = 0
  let current: Block | null = null
  let currentDepth = 0

  const countBraces = (s: string) => (s.match(/\{/g)?.length ?? 0) - (s.match(/\}/g)?.length ?? 0)

  for (const raw of src.split('\n')) {
    const code = stripComments(raw)
    const trimmed = code.trim()

    if (current === null && depth === 1 && /^location\s/.test(trimmed)) {
      current = { header: trimmed.replace(/\s*\{$/, ''), body: '' }
      currentDepth = depth
    } else if (current !== null) {
      current.body += `${code}\n`
    }

    depth += countBraces(code)

    if (current !== null && depth === currentDepth) {
      blocks.push(current)
      current = null
    }
  }

  return blocks
}

const locations = parseLocations(template)
const contentLocations = locations.filter((b) => !API_OWNED.some((p) => b.header.includes(p)))

describe('nginx.conf.template — headers de seguranca', () => {
  it('o parser encontra todos os location do template', () => {
    expect(locations).toHaveLength(LOCATION_COUNT)
  })

  it('o server nao define os headers (evita heranca nos proxies do API)', () => {
    // Os headers sao deliberadamente por location: postos no `server`
    // seriam herdados por `/api/`, `/sitemap.xml` e pelos redirects do
    // API, duplicando os do helmet.
    const serverLevel = template
      .split('location ')
      .map((part, i) => (i === 0 ? part : ''))
      .join('')
    expect(serverLevel).not.toContain('add_header X-Frame-Options')
  })

  it.each(contentLocations.map((b) => [b.header, b] as const))(
    '%s repete os headers todos (add_header de location substitui o do server)',
    (_header, block) => {
      for (const header of SECURITY_HEADERS) {
        expect(block.body).toContain(header)
      }
      // Sem isto o stage deixa de enviar X-Robots-Tag nestes caminhos.
      expect(block.body).toContain(ROBOTS_HEADER)
    },
  )

  it('cobre todas as locations de conteudo (nenhuma ficou de fora)', () => {
    // 4 de conteudo + 5 que respondem por proxy do API.
    expect(contentLocations).toHaveLength(LOCATION_COUNT - API_OWNED.length)
  })

  it('nao injecta headers nos locations do API (helmet responde por eles)', () => {
    const apiLocations = locations.filter((b) => API_OWNED.some((p) => b.header.includes(p)))
    expect(apiLocations).toHaveLength(API_OWNED.length)
    for (const block of apiLocations) {
      expect(block.body).not.toContain('add_header X-Frame-Options')
      expect(block.body).not.toContain('Content-Security-Policy-Report-Only')
    }
  })
})
