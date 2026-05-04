# `apps/web/public/` — assets estáticos servidos sob `/`

## Inventário

- `paw.svg` — favicon (32×32, mantém-se nítido a 16px).
- `icon-192.svg` / `icon-512.svg` — ícones PWA (maskable, fundo cream + pata caramel).
- `og-image.svg` — Open Graph card (1200×630). Usado para partilhas
  sociais e como `twitter:image` no `<head>`.
- `manifest.webmanifest` — PWA manifest (apenas SVG por enquanto).
- `robots.txt` — directivas para crawlers (genéricos + LLMs).
- `llms.txt` — índice em Markdown para LLMs (Anthropic / llmstxt.org).

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
