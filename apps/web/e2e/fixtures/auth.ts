import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { API_BASE_URL, DEMO_BREEDER_EMAILS, DEMO_CLIENT_EMAILS, DEMO_PASSWORD } from './demo-data'

export type DemoRole = 'breeder' | 'client'

export function pickDemoEmail(role: DemoRole, idx = 0): string {
  const list = role === 'breeder' ? DEMO_BREEDER_EMAILS : DEMO_CLIENT_EMAILS
  return list[idx % list.length]
}

/**
 * Faz login programático contra a API e deixa a página autenticada.
 *
 * ⚠️ O POST de login é feito através do **contexto do browser**
 * (`page.context().request`) e NÃO do fixture `request` passado pelo teste.
 * Isso é essencial: o `refresh_token` vive num cookie `httpOnly` que a API
 * define na resposta de `/auth/login`. O fixture `request` (standalone) tem o
 * seu próprio cookie jar — o browser nunca veria esse cookie. Consequência
 * (observada em stage, PATA-E2E-11): o `AuthContext` hidrata do localStorage,
 * o `isTokenExpired()` manda-o para o ramo de refresh, o `POST /auth/refresh`
 * feito pelo browser não tem cookie, devolve 401, o interceptor do `api.ts`
 * limpa o localStorage e faz `window.location.href = '/entrar?next=...'` —
 * o teste aterra em `/entrar` a meio de uma rota protegida.
 *
 * Mantém-se a injecção em localStorage (chaves `access_token` + `user`, as que
 * o `AuthContext` lê) para o primeiro render já estar autenticado, sem
 * depender do refresh.
 *
 * O parâmetro `request` é aceite por compatibilidade com os call sites
 * existentes, mas ignorado de propósito.
 */
export async function loginViaApi(
  request: APIRequestContext,
  page: Page,
  email: string,
  password: string = DEMO_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string; user: unknown }> {
  void request
  // Contexto do browser: partilha o cookie jar com a página (refresh_token).
  const res = await page.context().request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  })
  expect(res.ok(), `Login API falhou para ${email}: ${res.status()} ${await res.text()}`).toBe(true)
  const body = (await res.json()) as {
    accessToken: string
    refreshToken: string
    user: unknown
  }

  // IMPORTANTE: as chaves reais usadas pelo AuthContext sao `access_token` e
  // `user` (ver apps/web/src/contexts/AuthContext.tsx). NAO sao "accessToken"
  // / "refreshToken". O refresh token vive em cookie HTTPOnly definido pela
  // API. Aqui so' precisamos de injectar o access token + user.
  // Garantir que existe um document para correr addInitScript em qualquer URL
  // do baseURL.
  await page.goto('/')
  await page.addInitScript(
    ({ accessToken, user }) => {
      try {
        window.localStorage.setItem('access_token', accessToken)
        if (user) window.localStorage.setItem('user', JSON.stringify(user))
      } catch {
        // ignore
      }
    },
    { accessToken: body.accessToken, user: body.user },
  )
  // Persistir já no contexto atual também (caso o caller não recarregue)
  await page.evaluate(
    ({ accessToken, user }) => {
      window.localStorage.setItem('access_token', accessToken)
      if (user) window.localStorage.setItem('user', JSON.stringify(user))
    },
    { accessToken: body.accessToken, user: body.user },
  )

  return body
}

export async function logout(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('access_token')
    window.localStorage.removeItem('user')
  })
}

export function uniqueEmail(prefix = 'e2e'): string {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}+${stamp}${rand}@e2e.patacerta.test`
}

/**
 * Injecta uma decisão de consent já tomada no localStorage para que o
 * `ConsentBanner` não apareça e bloqueie cliques/inputs em testes.
 * Tem de ser chamado ANTES de `page.goto(...)` (usa `addInitScript`).
 *
 * Versão e schema têm de bater certo com `apps/web/src/lib/consent.ts`
 * (`COOKIE_CONSENT_VERSION` e `STORAGE_KEY`).
 */
export async function dismissConsentBanner(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'pc_consent_v1',
        JSON.stringify({
          anonId: 'e2e-' + Math.random().toString(36).slice(2, 10),
          decision: { necessary: true, analytics: false, marketing: false },
          version: '2026-04-30',
          decidedAt: new Date().toISOString(),
        }),
      )
    } catch {
      // ignore
    }
  })
}
