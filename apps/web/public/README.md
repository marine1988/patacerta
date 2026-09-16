# `apps/web/public/` — assets estáticos servidos sob `/`

## Inventário

- `paw.svg` — favicon (32×32, mantém-se nítido a 16px).
- `icon-192.svg` / `icon-512.svg` — ícones PWA (maskable, fundo cream + pata caramel).
- `og-image.svg` — Open Graph card (1200×630). Usado para partilhas
  sociais e como `twitter:image` no `<head>`.
- `manifest.webmanifest` — PWA manifest (apenas SVG por enquanto).
- `robots.txt` — directivas para crawlers (genéricos + LLMs). O host da linha
  `Sitemap:` é um placeholder resolvido no build/dev a partir de `VITE_PUBLIC_URL`
  (plugin `patacerta:public-url` em `apps/web/vite.config.ts`) — **nunca** escrever
  lá um domínio literal, senão o stage anuncia a sitemap de produção (PATA-BUG-9).
- `llms.txt` — índice em Markdown para LLMs (Anthropic / llmstxt.org). Igual ao
  `robots.txt`: o host vive no placeholder `__PUBLIC_URL__` (11 sítios — prosa,
  links Markdown e código inline), resolvido pelo mesmo plugin, pelo que o
  `llms.txt` servido em stage fala de **stage**. Aqui o placeholder _aparece na
  prosa_ do ficheiro fonte — decisão consciente (PATA-BUG-10): as alternativas
  eram (a) templatar só a linha do domínio canónico e deixar 9 links absolutos a
  apontar a produção, ou (b) trocar tudo por paths relativos, que num documento
  citado por LLMs perdem a canonicalidade. O build **falha** se o `dist/llms.txt`
  ficar com o placeholder, sem a linha `Domínio canónico:` ou a anunciar outro
  domínio. Não escrever aqui hosts literais.

## TODO: gerar PNGs

Alguns crawlers (Twitter/X, WhatsApp, certas redes empresariais) não
renderizam SVG nas previews de partilha. Quando estes ficheiros forem
gerados, adicioná-los a este directório com os nomes:

- `og-image.png` (1200×630, fundo cream, < 600 kB)
- `apple-touch-icon.png` (180×180, fundo opaco — iOS aplica sempre máscara)
- `icon-192.png`, `icon-512.png` (PWA Android)
- `icon-32.png` (favicon legacy)

Depois, no `index.html` e no `manifest.webmanifest`:

1. Adicionar de volta as referências `<link rel="alternate icon" type="image/png" ...>`
   e `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`.
2. Trocar `og-image.svg` → `og-image.png` (ou listar ambos com `og:image` repetido,
   PNG primeiro).
3. Adicionar entradas PNG em `manifest.webmanifest` no array `icons`.

Ferramentas sugeridas: `sharp` (Node), `imagemagick` (CLI), ou render via
headless Chromium (Playwright/Puppeteer). Manter os SVGs como fonte de verdade.
