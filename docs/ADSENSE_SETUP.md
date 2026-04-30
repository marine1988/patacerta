# AdSense — Guia de Configuração

Sistema de publicidade do PataCerta. Implementação **leve**, baseada em
Google AdSense (anúncios servidos pelo Google em troca de receita por
impressão/clique). Não temos painel interno de anunciantes — a Google
gere a procura.

## Visão geral da arquitectura

```
apps/web/src/components/ads/
├── AdSlot.tsx          # <ins class="adsbygoogle"> + push() lazy
├── AdContainer.tsx     # Wrapper UI (label "Publicidade" + gating)
├── useAdsAllowed.ts    # Hook de exclusão de páginas sensíveis
├── slots.ts            # Mapa central dos slot IDs
└── index.ts            # Barrel
```

**Variáveis de ambiente** (em `.env` / Dokploy):

| Var                      | Default   | Notas                                         |
| ------------------------ | --------- | --------------------------------------------- |
| `VITE_ADSENSE_CLIENT_ID` | _(vazio)_ | Publisher ID, ex: `ca-pub-1234567890123456`   |
| `VITE_ADSENSE_ENABLED`   | `false`   | `true` apenas em produção depois de aprovação |

Se qualquer das duas estiver vazia/false, **nenhum slot renderiza** e o
script `adsbygoogle.js` nem sequer é injectado. Zero impacto em
performance/privacy nesse caso.

## Slots actualmente integrados

Definidos em `apps/web/src/components/ads/slots.ts`:

| Chave           | Localização                | Notas                        |
| --------------- | -------------------------- | ---------------------------- |
| `homepageMid`   | `/` entre hero e listagens | Banner horizontal responsive |
| `breederDetail` | `/criador/:id` sidebar     | Inline em mobile             |
| `serviceDetail` | `/servicos/:id` sidebar    | Inline em mobile             |

**Páginas excluídas** (em `useAdsAllowed.ts`):
`/entrar`, `/registar`, `/recuperar-palavra-passe`,
`/redefinir-palavra-passe`, `/verificar-email`, `/area-pessoal*`,
`/admin*`, `/mensagens*`, `/publicar*`, `/criador-onboarding*`,
`/avaliar*`.

## Setup passo-a-passo (a executar quando quisermos activar)

### 1. Criar conta AdSense

1. Ir a <https://adsense.google.com/start/>
2. Adicionar o site `patacerta.pt` (não usar stage — o Google quer o
   domínio principal de produção).
3. Copiar o snippet `<script async src="https://pagead2..."
data-ad-client="ca-pub-XXXX">` que o Google fornece.
4. **NÃO precisamos** de colocar esse snippet manualmente em
   `index.html` — o nosso `AdSlot.tsx` já injecta o script
   dinamicamente. Basta extrair o `ca-pub-XXXX` do snippet.

### 2. Verificar propriedade do domínio

O Google dá 3 opções: _AdSense code snippet_, _ads.txt_ ou _Meta tag_.

A mais simples para nós: **ads.txt**.

1. No painel AdSense, copiar a linha (formato:
   `google.com, pub-XXXX, DIRECT, f08c47fec0942fa0`).
2. Criar `apps/web/public/ads.txt` com essa linha.
3. Fazer deploy. O Google verifica em ~24-48h.

### 3. Criar os slots no painel AdSense

Para cada chave em `slots.ts` (`homepageMid`, `breederDetail`,
`serviceDetail`):

1. _Ads → By ad unit → Create new → Display ads_
2. Nome interno: `pc-homepage-mid`, `pc-breeder-detail`, etc.
3. Tipo: **Responsive**.
4. Copiar o `data-ad-slot="1234567890"` que o Google gera.
5. Substituir o valor vazio em `apps/web/src/components/ads/slots.ts`.

### 4. Activar em produção

No painel Dokploy (ou `.env.prod`):

```env
VITE_ADSENSE_CLIENT_ID=ca-pub-1234567890123456
VITE_ADSENSE_ENABLED=true
```

Rebuild + redeploy. Os anúncios começam a aparecer (podem demorar até
30 min na primeira vez por causa da pipeline da Google).

## RGPD / Consent (importante)

**Estado actual**: o PataCerta **não tem** Consent Management Platform
(CMP). Isto é um problema para servir AdSense personalizado em PT/UE.

**Solução interim**: o `AdSlot.tsx` define
`requestNonPersonalizedAds = 1` antes de cada `push()`. Isto força o
Google a servir só **anúncios não-personalizados** (sem cookies de
tracking individual), o que é compatível com RGPD sem consentimento
explícito.

**Quando integrarmos um CMP** (ex: Google-funded CMP, Cookiebot,
Didomi):

1. Remover a linha `queue.requestNonPersonalizedAds = 1` em `AdSlot.tsx`.
2. O CMP injecta o `__tcfapi` global e o Google detecta automaticamente.
3. Anúncios personalizados (eCPM mais alto) ficam disponíveis para
   utilizadores que aceitam.

Sem CMP integrado, **não activar** anúncios personalizados — pode
resultar em coima RGPD e/ou suspensão da conta AdSense.

## Política de conteúdo PataCerta

O AdSense rejeita sítios com conteúdo proibido. Pontos críticos para
nós:

- ✅ Animais de companhia / criadores éticos: aceite.
- ⚠️ Imagens explícitas de cacharras / parto: evitar nas fotos públicas.
- ⚠️ Reviews: filtrar linguagem ofensiva (já temos moderação).
- ❌ Não permitir anúncios de venda directa de animais "de qualquer
  origem" (a nossa premissa de criadores verificados protege-nos).

## Manutenção

- **Adicionar novo slot**: adicionar entrada em `slots.ts` + criar slot
  no painel AdSense + colocar `<AdContainer>` na página.
- **Remover página da exclusão**: editar `EXCLUDED_PREFIXES` em
  `useAdsAllowed.ts`.
- **Mudar formato**: passar `format="rectangle"` etc. ao `AdContainer`.
- **Debug local**: definir `VITE_ADSENSE_ENABLED=true` num `.env.local`
  com um `VITE_ADSENSE_CLIENT_ID` real — o Google só serve anúncios
  reais em domínios aprovados, mas pode-se ver se o `<ins>` é
  injectado.

## Checklist pré-activação

- [ ] Conta AdSense criada e domínio aprovado.
- [ ] `ads.txt` em produção.
- [ ] Slot IDs preenchidos em `slots.ts`.
- [ ] `VITE_ADSENSE_CLIENT_ID` + `VITE_ADSENSE_ENABLED=true` em prod.
- [ ] Verificado em prod que os 3 slots renderizam.
- [ ] Política de privacidade actualizada a mencionar AdSense + cookies.
- [ ] (Futuro) CMP integrado para activar anúncios personalizados.
