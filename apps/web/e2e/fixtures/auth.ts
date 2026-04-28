import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { API_BASE_URL, DEMO_BREEDER_EMAILS, DEMO_CLIENT_EMAILS, DEMO_PASSWORD } from './demo-data'

export type DemoRole = 'breeder' | 'client'

export function pickDemoEmail(role: DemoRole, idx = 0): string {
  const list = role === 'breeder' ? DEMO_BREEDER_EMAILS : DEMO_CLIENT_EMAILS
  return list[idx % list.length]
}

/**
 * Faz login direto contra a API e injeta os tokens no localStorage da página
 * antes de navegar. Mais rápido e fiável que passar pelo formulário UI.
 *
 * Os tokens são guardados nas chaves esperadas pelo `useAuth` da web app
 * (ver apps/web/src/contexts/AuthContext.tsx — `accessToken`/`refreshToken`).
 */
export async function loginViaApi(
  request: APIRequestContext,
  page: Page,
  email: string,
  password: string = DEMO_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  })
  expect(res.ok(), `Login API falhou para ${email}: ${res.status()} ${await res.text()}`).toBe(true)
  const body = (await res.json()) as {
    accessToken: string
    refreshToken: string
    user: unknown
  }

  // Garantir que existe um document para correr addInitScript em qualquer URL
  // do baseURL.
  await page.goto('/')
  await page.addInitScript(
    ({ accessToken, refreshToken, user }) => {
      try {
        window.localStorage.setItem('accessToken', accessToken)
        window.localStorage.setItem('refreshToken', refreshToken)
        if (user) window.localStorage.setItem('user', JSON.stringify(user))
      } catch {
        // ignore
      }
    },
    { accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user },
  )
  // Persistir já no contexto atual também (caso o caller não recarregue)
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      window.localStorage.setItem('accessToken', accessToken)
      window.localStorage.setItem('refreshToken', refreshToken)
      if (user) window.localStorage.setItem('user', JSON.stringify(user))
    },
    { accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user },
  )

  return body
}

export async function logout(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('accessToken')
    window.localStorage.removeItem('refreshToken')
    window.localStorage.removeItem('user')
  })
}

export function uniqueEmail(prefix = 'e2e'): string {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}+${stamp}${rand}@e2e.patacerta.test`
}
