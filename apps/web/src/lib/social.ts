/**
 * Redes sociais oficiais do PataCerta — FONTE ÚNICA.
 *
 * Consumido por:
 *  - `components/layout/Footer.tsx` — links visíveis no footer;
 *  - o `Organization` JSON-LD (`sameAs`) — card seguinte (PATA-SOCIAL-2).
 *
 * Não duplicar estes URLs em mais nenhum ficheiro: mudar um handle faz-se
 * aqui e propaga-se a todos os consumidores. Os URLs são os oficiais e são
 * usados literalmente (sem normalizar nem "corrigir" barras/traços).
 */

export interface SocialLink {
  id: 'instagram' | 'youtube' | 'tiktok'
  network: string
  handle: string
  url: string
}

export const SOCIAL_LINKS: SocialLink[] = [
  {
    id: 'instagram',
    network: 'Instagram',
    handle: '@patacerta.pt',
    url: 'https://www.instagram.com/patacerta.pt/',
  },
  {
    id: 'youtube',
    network: 'YouTube',
    handle: '@patacerta-pt',
    url: 'https://www.youtube.com/@patacerta-pt',
  },
  {
    id: 'tiktok',
    network: 'TikTok',
    handle: '@patacerta.pt',
    url: 'https://www.tiktok.com/@patacerta.pt',
  },
]
