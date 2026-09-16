import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// ------------------------------------------------------------
// Manual chunks
//
// Split do bundle inicial em fatias por vendor estável: o
// browser pode cachear separadamente cada grupo e uma alteração
// no nosso código não invalida `react-vendor`/`router-vendor`/
// `query-vendor` (que mudam raramente).
//
// Não tocamos no leaflet — o Vite já o coloca em chunk próprio
// via os imports dinâmicos das páginas que o usam.
// ------------------------------------------------------------
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('react-router')) return 'router-vendor'
  if (id.includes('@tanstack/react-query') || id.includes('@tanstack\\react-query')) {
    return 'query-vendor'
  }
  if (id.includes('react-error-boundary')) return 'react-vendor'
  if (id.includes('axios')) return 'http-vendor'
  if (id.includes('zod')) return 'validation-vendor'

  // react/react-dom têm de ficar juntos — separar dá problemas
  // com o singleton do React (hooks só funcionam se for a mesma
  // instância em runtime).
  if (
    id.includes('node_modules/react/') ||
    id.includes('node_modules/react-dom/') ||
    id.includes('node_modules\\react\\') ||
    id.includes('node_modules\\react-dom\\') ||
    id.includes('/scheduler/') ||
    id.includes('\\scheduler\\')
  ) {
    return 'react-vendor'
  }

  return undefined
}

// ------------------------------------------------------------
// Ficheiros estáticos de `public/` que anunciam o domínio do ambiente
//
// `public/robots.txt` e `public/llms.txt` são ficheiros ESTÁTICOS: são
// copiados tal-e-qual para o `dist/` e daí para a imagem de TODOS os
// ambientes. Com o host literal lá dentro, o que é servido em stage (e em
// qualquer preview/fork) anunciava o domínio de produção — PATA-BUG-9
// (`robots.txt`) e PATA-BUG-10 (`llms.txt`), a mesma classe do PATA-BUG-7
// (`<loc>` do sitemap a apontar para o outro ambiente).
//
// Por isso o host vive num placeholder (`__PUBLIC_URL__`) resolvido por este
// plugin a partir de `VITE_PUBLIC_URL` — a MESMA fonte do `canonical`, do
// `og:url` e do `<loc>` do sitemap (`src/lib/seo.ts`). Fallback igual ao do
// `seo.ts` para não haver dois domínios canónicos diferentes no mesmo build.
//
// Porque não `sed` no Dockerfile do web, nem `envsubst` no nginx (as duas
// alternativas equacionadas nos cards): o `dist/` não nasce só na imagem —
//  - CI: `.github/workflows/e2e.yml` corre `pnpm --filter @patacerta/web build`
//    e serve o resultado com `vite preview` (sem Dockerfile, sem envsubst);
//  - dev: o Vite serve `public/` cru, sem passar por transformação nenhuma.
// Resolver aqui cobre os três caminhos com uma única fonte de verdade.
//
// `llms.txt` é prosa Markdown: o placeholder aparece no meio de frases, em
// links (`[Pesquisar](__PUBLIC_URL__/pesquisar)`) e em código inline
// (`` `__PUBLIC_URL__` ``). Decisão consciente (PATA-BUG-10), documentada em
// `apps/web/public/README.md` e `apps/web/e2e/README.md`: o ficheiro servido
// tem de anunciar o domínio do ambiente e um link relativo num documento
// citado por LLMs perde a canonicalidade. O ficheiro FONTE fica com o
// placeholder à vista — é o preço de ter o host num único sítio.
// ------------------------------------------------------------
const PUBLIC_URL_PLACEHOLDER = '__PUBLIC_URL__'

/** Igual ao fallback de `src/lib/seo.ts` — tem de ser o mesmo. */
const DEFAULT_PUBLIC_URL = 'https://patacerta.pt'

/** URL absoluta dentro de um destes ficheiros (para o guard de domínio). */
const ABSOLUTE_URL = /https?:\/\/[^\s<>()[\]"'`]+/g

/**
 * Hosts do produto. Uma URL destes resolvida fora do `publicUrl` do ambiente é
 * exactamente o defeito dos PATA-BUG-7/9/10 (o ficheiro estático a anunciar o
 * outro ambiente). Hosts de terceiros (ex.: `www.robotstxt.org` na
 * documentação do `robots.txt`) não são deste escopo e passam.
 */
const PRODUCT_HOSTS = ['patacerta.pt', 'www.patacerta.pt']

/** A URL pertence ao domínio do ambiente em build? */
const belongsToEnvironment = (url: string, publicUrl: string): boolean =>
  url === publicUrl || url.startsWith(`${publicUrl}/`)

/** Hostname de uma URL absoluta (`null` se não for parseável). */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

interface PublicUrlFile {
  /** Nome em `public/` — servido em `/<name>`. */
  name: string
  /**
   * Substring que TEM de existir no conteúdo já resolvido. Um ficheiro que
   * perca esta linha (ou que a sirva resolvida a outro domínio) sai do build
   * a mentir sobre o ambiente — o build falha em vez de sair torto.
   */
  required: (publicUrl: string) => string
}

const PUBLIC_URL_FILES: PublicUrlFile[] = [
  { name: 'robots.txt', required: (url) => `Sitemap: ${url}/sitemap.xml` },
  { name: 'llms.txt', required: (url) => `Domínio canónico: \`${url}\`` },
]

/** Host do ambiente actual, sem trailing slash. */
function resolvePublicUrl(mode: string): string {
  const fromEnv = loadEnv(mode, __dirname, 'VITE_').VITE_PUBLIC_URL
  if (!fromEnv) {
    // Aviso (não erro): o `seo.ts` também cai no default de produção, e em
    // dev é o comportamento esperado. Em stage/preview isto é um defeito —
    // e o spec `seo-metadata.spec.ts` falha por isso.
    console.warn(
      `[public-url] VITE_PUBLIC_URL não definida — a usar ${DEFAULT_PUBLIC_URL} ` +
        '(igual a src/lib/seo.ts). Em stage/preview define-a ou o robots.txt ' +
        'e o llms.txt apontam ao domínio de produção.',
    )
    return DEFAULT_PUBLIC_URL
  }
  return fromEnv.replace(/\/+$/, '')
}

/**
 * Substitui `__PUBLIC_URL__` nos ficheiros de `PUBLIC_URL_FILES` servidos por
 * cada ambiente.
 *
 * - dev/preview: middleware próprio, ANTES do middleware da public dir (esse
 *   serviria o template cru com o placeholder);
 * - build: reescreve os ficheiros já copiados para `dist/` e falha alto se o
 *   resultado ficar com o placeholder, sem a linha esperada, ou a anunciar
 *   outro domínio.
 */
function publicUrlFiles(publicUrl: string): Plugin {
  const entries = PUBLIC_URL_FILES.map(({ name, required }) => {
    const template = path.resolve(__dirname, `public/${name}`)
    const outFile = path.resolve(__dirname, `dist/${name}`)

    return {
      name,
      outFile,
      required,
      /** Template com o host do ambiente já resolvido. */
      render: (): string =>
        fs.readFileSync(template, 'utf8').split(PUBLIC_URL_PLACEHOLDER).join(publicUrl),
      /** O que o build deixou em `dist/` (ou `null` se ainda não há build). */
      built: (): string | null =>
        fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null,
    }
  })

  /** Middleware que serve `/<name>` a partir da fonte indicada. */
  const serveFrom =
    (name: string, source: () => string): Connect.NextHandleFunction =>
    (req, res, next) => {
      if ((req.url ?? '').split('?')[0] !== `/${name}`) return next()
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      // Sem cache: em dev/preview o conteúdo depende de VITE_PUBLIC_URL e um
      // ficheiro cacheado mente. Em produção quem serve é o ficheiro de
      // `dist/` (nginx), não este middleware.
      res.setHeader('cache-control', 'no-cache')
      res.end(req.method === 'HEAD' ? undefined : source())
    }

  return {
    name: 'patacerta:public-url',
    // dev: o Vite serve `public/` cru, logo o plugin resolve o placeholder
    // (o middleware da public dir corre depois destes).
    configureServer(server) {
      for (const entry of entries) {
        server.middlewares.use(serveFrom(entry.name, entry.render))
      }
    },
    // preview: serve os ARTEFACTOS do build (é isso que o nginx publica) e só
    // cai no template se o ficheiro ainda não existir em `dist/`.
    configurePreviewServer(server) {
      for (const entry of entries) {
        server.middlewares.use(serveFrom(entry.name, () => entry.built() ?? entry.render()))
      }
    },
    // `public/` já foi copiado para `dist/` quando os hooks de output correm
    // (Vite 5: `prepareOutDir` antes de `bundle.write`), logo aqui os
    // ficheiros existem para ser corrigidos.
    writeBundle() {
      for (const entry of entries) {
        if (fs.existsSync(entry.outFile)) fs.writeFileSync(entry.outFile, entry.render())
      }
    },
    // Rede de segurança: um ficheiro publicado com o placeholder por resolver,
    // sem a linha esperada, ou a anunciar OUTRO domínio publicaria SEO errado
    // (é o defeito dos PATA-BUG-7/9/10) — o build falha em vez de sair torto.
    closeBundle() {
      for (const entry of entries) {
        if (!fs.existsSync(entry.outFile)) continue
        const written = fs.readFileSync(entry.outFile, 'utf8')

        if (written.includes(PUBLIC_URL_PLACEHOLDER)) {
          throw new Error(
            `[${entry.name}] dist/${entry.name} tem ${PUBLIC_URL_PLACEHOLDER} por resolver — ` +
              'o placeholder não chegou a ser substituído.',
          )
        }

        const required = entry.required(publicUrl)
        if (!written.includes(required)) {
          throw new Error(
            `[${entry.name}] dist/${entry.name} não ficou com '${required}' — ` +
              `verificar public/${entry.name}.`,
          )
        }

        const urls = written.match(ABSOLUTE_URL) ?? []
        if (urls.length === 0) {
          throw new Error(
            `[${entry.name}] dist/${entry.name} não tem nenhuma URL absoluta — ` +
              `verificar public/${entry.name} (esperado o host ${publicUrl}).`,
          )
        }

        // Hosts do produto: dentro do ambiente em build ou defeito (PATA-BUG-7/9/10).
        const foreign = urls.filter(
          (url) =>
            PRODUCT_HOSTS.includes(hostnameOf(url) ?? '') && !belongsToEnvironment(url, publicUrl),
        )
        if (foreign.length > 0) {
          throw new Error(
            `[${entry.name}] dist/${entry.name} anuncia outro domínio (esperado ${publicUrl}): ` +
              `${foreign.join(', ')} — verificar public/${entry.name}.`,
          )
        }
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), publicUrlFiles(resolvePublicUrl(mode))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Local dev: proxy MinIO public objects directly. In production
      // this is handled by the SPA's nginx (see apps/web/nginx.conf).
      '/patacerta-uploads': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
}))
