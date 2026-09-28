/**
 * Fixture de teste com detecção de capacidades do ambiente.
 *
 * Usar `import { test, expect } from '../fixtures/test'` em vez de
 * `'@playwright/test'` quando o spec depende de dados reais (breeders,
 * serviços, utilizadores demo). O `caps` é resolvido uma vez por worker e
 * fica disponível em cada teste:
 *
 * ```ts
 * test('perfil de criador', async ({ page, caps }) => {
 *   test.skip(!caps.hasBreeders, seedSkipReason(caps, 'criadores publicados'))
 *   ...
 * })
 * ```
 *
 * O que `caps` sonda (uma vez por worker, ~3 pedidos):
 *  - `/api/health` → `apiHealthy` / `authBlocked` (401 = basic auth do stage);
 *  - `/api/search/breeders` + `/api/services` → `hasBreeders` / `hasServices`;
 *  - logins demo/admin → `hasDemoClient` / `hasDemoBreeder` / `hasAdmin`
 *    (desligados em produção: `PROBE_LOGINS` — o rate-limit de login é 10
 *    tentativas/15 min/IP e em prod as contas demo nem existem).
 *
 * Resultado típico por ambiente:
 *  - local  → authBlocked=false, hasDemoClient=true, hasAdmin=true
 *  - prod   → authBlocked=false, hasDemoClient=false, hasAdmin=false (sem sondar logins)
 *  - stage sem E2E_HTTP_USER/PASS → authBlocked=true, tudo false
 */

import { test as base, expect } from '@playwright/test'
import { API_BASE_URL } from './demo-data'
import { HTTP_CREDENTIALS, describeCapabilities, probeCapabilities, type Capabilities } from './env'

// `{}` (e não `Record<string, never>`) para os fixtures de teste: com
// `Record<string, never>` o TS colapsa o tipo do worker fixture `caps` para
// `never` e o `extend` deixa de compilar.
export const test = base.extend<{}, { caps: Capabilities }>({
  caps: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({
        baseURL: API_BASE_URL,
        // Basic auth do Traefik (stage). O contexto de `request` dos specs
        // herda `use.httpCredentials` da config; este é criado à mão, por
        // isso passa as mesmas credenciais explicitamente.
        ...(HTTP_CREDENTIALS ? { httpCredentials: HTTP_CREDENTIALS } : {}),
      })
      try {
        const caps = await probeCapabilities(request)
        // Uma linha por worker no log do gate — a evidência diz contra o que
        // é que a suite correu e porque é que cada skip disparou.
        console.log(`[caps] ${describeCapabilities(caps)}`)

        // Fail-fast quando o ambiente está rate-limited: sem isto todas as
        // sondas devolvem 0/401 e a suite produz skips e falhas que não
        // correspondem a nada real (ver Capabilities.rateLimited).
        if (caps.rateLimited && process.env.E2E_IGNORE_RATE_LIMIT !== '1') {
          throw new Error(
            [
              `Ambiente '${caps.env}' está RATE-LIMITED (HTTP 429 em ${API_BASE_URL}/health).`,
              `A suite não pode ser avaliada agora — os resultados seriam falsos.`,
              caps.rateLimitResetAt ? `O balde renova em ${caps.rateLimitResetAt}.` : '',
              `Correr em chunks pequenos e/ou esperar pelo reset (ver PATA-BUG-3).`,
              `Para forçar mesmo assim: E2E_IGNORE_RATE_LIMIT=1.`,
            ]
              .filter(Boolean)
              .join(' '),
          )
        }

        await use(caps)
      } finally {
        await request.dispose()
      }
    },
    { scope: 'worker' },
  ],
})

export { expect }
export type { Page, Locator, APIRequestContext, APIResponse } from '@playwright/test'
