/**
 * Detecção de ambiente + capacidades do alvo dos testes E2E.
 *
 * A suite corre em três sítios muito diferentes:
 *
 *  1. local   — stack dev com seeds determinísticas (`db:seed` + `db:seed:demo`)
 *  2. stage   — https://stage.patacerta.pt (branch `dev`, atrás de basic auth)
 *  3. prod    — https://patacerta.pt (branch `main`, dados reais)
 *
 * Em produção os dados são reais: pode não existir NENHUM criador publicado
 * nem os utilizadores demo. Sem detecção de capacidades, os testes que
 * dependem de seeds falham em produção com erros que parecem bugs da app
 * quando são, na verdade, testes mal desenhados. Aqui sondamos a API uma
 * vez por worker e expomos o resultado como fixture (`caps`), para que os
 * testes possam fazer `test.skip(!caps.breeders, '...')` com uma mensagem
 * clara em vez de rebentar.
 */

import { expect, type APIRequestContext } from '@playwright/test'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API_BASE_URL,
  DEMO_BREEDER_EMAILS,
  DEMO_CLIENT_EMAILS,
  DEMO_PASSWORD,
} from './demo-data'

export type TargetEnv = 'local' | 'stage' | 'prod' | 'unknown'

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173'

export function detectEnv(url: string = BASE_URL): TargetEnv {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return ''
    }
  })()

  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return 'local'
  if (host === 'stage.patacerta.pt' || host.startsWith('stage.')) return 'stage'
  if (host === 'patacerta.pt' || host === 'www.patacerta.pt') return 'prod'
  return host ? 'unknown' : 'local'
}

export const TARGET_ENV: TargetEnv = detectEnv()
export const IS_REMOTE = TARGET_ENV !== 'local'

/**
 * Domínio canónico esperado nas meta tags (`<link rel=canonical>`, `og:url`,
 * `<loc>` do sitemap).
 *
 * A web resolve isto em build-time via `VITE_PUBLIC_URL` (`lib/seo.ts`) —
 * se estiver mal definido, o stage publica canonical a apontar para a
 * produção (conteúdo duplicado). Aqui derivamos o esperado da própria URL
 * alvo e deixamos override explícito para ambientes exóticos.
 *
 * `null` = não assertamos o host (dev local, onde `VITE_PUBLIC_URL` aponta
 * para produção de propósito).
 */
export const EXPECTED_PUBLIC_URL: string | null = (() => {
  if (process.env.E2E_EXPECTED_PUBLIC_URL) {
    return process.env.E2E_EXPECTED_PUBLIC_URL.replace(/\/$/, '')
  }
  if (TARGET_ENV === 'local') return null
  try {
    return new URL(BASE_URL).origin
  } catch {
    return null
  }
})()

export const IS_PROD = TARGET_ENV === 'prod'

/**
 * Credenciais do HTTP basic auth (só stage, atrás do middleware Traefik).
 *
 * `null` quando `E2E_HTTP_USER`/`E2E_HTTP_PASS` não estão definidas — nesse
 * caso o `playwright.config.ts` simplesmente não envia credenciais e o alvo
 * devolve 401 (falha honesta, não crash de configuração). Fonte única para o
 * fixture `caps`, que cria os seus próprios `APIRequestContext`.
 */
export const HTTP_CREDENTIALS: { username: string; password: string } | null = (() => {
  const username = process.env.E2E_HTTP_USER
  const password = process.env.E2E_HTTP_PASS
  if (!username || !password) return null
  return { username, password }
})()

/**
 * Sondar logins consome o rate-limit de autenticação (`loginRateLimit`:
 * 10 tentativas / 15 min / IP). Em produção os utilizadores demo/admin nem
 * existem, por isso sondar só gasta orçamento sem dar informação. Fica
 * desligado por defeito em produção e liga-se com `E2E_PROBE_LOGINS=1`.
 */
export const PROBE_LOGINS =
  process.env.E2E_PROBE_LOGINS === '1'
    ? true
    : process.env.E2E_PROBE_LOGINS === '0'
      ? false
      : TARGET_ENV !== 'prod'

export interface Capabilities {
  /** Ambiente detectado a partir de `E2E_BASE_URL`. */
  env: TargetEnv
  baseUrl: string
  apiBaseUrl: string
  /** `GET /api/health` devolve 200 com `services.database === 'connected'`. */
  apiHealthy: boolean
  /**
   * A API respondeu 401/403 — alvo fechado por HTTP basic auth (stage) e
   * `E2E_HTTP_USER`/`E2E_HTTP_PASS` ausentes ou erradas. Distingue "não tenho
   * credenciais" de "não há seeds", para a mensagem de skip dizer a verdade.
   */
  authBlocked: boolean
  /**
   * `GET /api/health` devolveu 429 — o balde de rate-limit do IP
   * (`apiRateLimit`: 200 pedidos / 15 min) está esgotado.
   *
   * Isto NÃO é um problema da app: é o ambiente a recusar servir a suite.
   * Se não for detectado, todas as sondas seguintes devolvem 0/401 e os
   * testes fazem skip ou falham por razões que não existem — resultados
   * silenciosamente errados. Por isso o fixture `caps` aborta a suite
   * quando isto acontece (ver `fixtures/test.ts`).
   */
  rateLimited: boolean
  /** Instante de reset do balde (ISO), quando `rateLimited` é true. */
  rateLimitResetAt: string | null
  /** Total de criadores publicados (`meta.total` de /api/search/breeders). */
  breedersTotal: number
  /** Total de serviços publicados (`meta.total` de /api/services). */
  servicesTotal: number
  /** Existe pelo menos um criador utilizável em testes de detalhe. */
  hasBreeders: boolean
  /** Existe pelo menos um serviço utilizável em testes de detalhe. */
  hasServices: boolean
  /** As credenciais demo (cliente) autenticam neste ambiente. */
  hasDemoClient: boolean
  /** As credenciais demo (criador) autenticam neste ambiente. */
  hasDemoBreeder: boolean
  /** As credenciais admin autenticam neste ambiente. */
  hasAdmin: boolean
  /** As seeds demo estão aplicadas (utilizadores + dados). */
  seeded: boolean
}

async function tryLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<boolean> {
  try {
    const res = await request.post(`${API_BASE_URL}/auth/login`, { data: { email, password } })
    return res.ok()
  } catch {
    return false
  }
}

async function totalOf(request: APIRequestContext, path: string): Promise<number> {
  try {
    const res = await request.get(`${API_BASE_URL}${path}`)
    if (!res.ok()) return 0
    const json = (await res.json()) as { meta?: { total?: number }; data?: unknown[] }
    if (typeof json.meta?.total === 'number') return json.meta.total
    return Array.isArray(json.data) ? json.data.length : 0
  } catch {
    return 0
  }
}

/**
 * Sonda o ambiente alvo. Chamar uma vez por worker (fixture `caps`).
 * Nunca lança — em caso de falha devolve uma capacidade `false`/`0`.
 */
export async function probeCapabilities(request: APIRequestContext): Promise<Capabilities> {
  const empty = {
    env: TARGET_ENV,
    baseUrl: BASE_URL,
    apiBaseUrl: API_BASE_URL,
    apiHealthy: false,
    authBlocked: false,
    rateLimited: false,
    rateLimitResetAt: null,
    breedersTotal: 0,
    servicesTotal: 0,
    hasBreeders: false,
    hasServices: false,
    hasDemoClient: false,
    hasDemoBreeder: false,
    hasAdmin: false,
    seeded: false,
  } satisfies Capabilities

  let apiHealthy = false
  try {
    const res = await request.get(`${API_BASE_URL}/health`)
    if (res.status() === 429) {
      const resetHeader = res.headers()['x-ratelimit-reset']
      const resetAt = resetHeader ? new Date(Number(resetHeader) * 1000).toISOString() : null
      // Balde esgotado: parar já. Qualquer sonda seguinte é lixo (429) e
      // qualquer skip/falha a partir daqui seria mentira.
      return { ...empty, rateLimited: true, rateLimitResetAt: resetAt }
    }
    if (res.status() === 401 || res.status() === 403) {
      // Alvo fechado por basic auth (stage sem credenciais). Nenhuma sonda
      // seguinte vale a pena — tudo devolveria 401 e o rate-limit de login
      // seria gasto em vão.
      return { ...empty, authBlocked: true }
    }
    if (res.ok()) {
      const body = (await res.json()) as { status?: string; services?: { database?: string } }
      apiHealthy = body.status === 'ok' && body.services?.database === 'connected'
    }
  } catch {
    apiHealthy = false
  }

  const [breedersTotal, servicesTotal] = await Promise.all([
    totalOf(request, '/search/breeders?limit=1'),
    totalOf(request, '/services?limit=1'),
  ])

  const [hasDemoClient, hasDemoBreeder, hasAdmin] = PROBE_LOGINS
    ? await Promise.all([
        tryLogin(request, DEMO_CLIENT_EMAILS[0], DEMO_PASSWORD),
        tryLogin(request, DEMO_BREEDER_EMAILS[0], DEMO_PASSWORD),
        tryLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD),
      ])
    : [false, false, false]

  return {
    ...empty,
    apiHealthy,
    breedersTotal,
    servicesTotal,
    hasBreeders: breedersTotal > 0,
    hasServices: servicesTotal > 0,
    hasDemoClient,
    hasDemoBreeder,
    hasAdmin,
    seeded: hasDemoClient && hasDemoBreeder,
  }
}

/**
 * Sonda se o ALVO tem Stripe configurado (chave presente no processo da API).
 *
 * Porque e' uma sonda de runtime e nao `process.env.STRIPE_SECRET_KEY`: o env
 * do processo de testes nao e' o env do backend. Localmente a API le a chave do
 * seu `.env`/docker-compose (o runner do Playwright nao a ve) e no job de CI o
 * env e' partilhado por varios processos — so' a API sabe a verdade.
 * Perguntar-lhe e' mais honesto e nao produz skips falsos.
 *
 * Endpoint: `POST /api/webhooks/stripe` SEM assinatura — publico, sem
 * rate-limit, responde ANTES de tocar na base de dados
 * (`apps/api/src/modules/webhooks/stripe-webhook.controller.ts`), logo sem
 * efeitos secundarios (um POST a `/payments/sponsored-slot/checkout` criaria
 * sessao Stripe + slot PENDING e estragaria a sonda).
 *
 * Decisao: so' se faz skip perante prova positiva de que o Stripe esta'
 * desligado (`503 STRIPE_NOT_CONFIGURED`). `503 WEBHOOK_NOT_CONFIGURED` (a
 * chave existe, falta so' o webhook secret) e `400 Assinatura em falta`
 * significam "configurado". Rede, 401 (basic auth), 429 ou 404 ->
 * `configured: true`: o teste corre e falha honestamente, em vez de esconder
 * uma quebra real atras de um skip silencioso.
 *
 * Usado pelos specs `sponsored-slot-*` (card PATA-CI-4): sem isto o job `E2E`
 * do CI — que nao define NENHUMA `STRIPE_*` — gastava 3 x 1.1 min num
 * `waitForURL(/checkout.stripe.com/)` que nunca podia passar.
 */
export async function probeStripeOnTarget(
  request: APIRequestContext,
): Promise<{ configured: boolean; detail: string }> {
  const path = `${API_BASE_URL}/webhooks/stripe`
  try {
    const res = await request.post(path, {
      headers: { 'content-type': 'application/json' },
      data: '{}',
    })
    const body = await res.text()
    if (res.status() === 503 && body.includes('STRIPE_NOT_CONFIGURED')) {
      return { configured: false, detail: `POST ${path} -> 503 STRIPE_NOT_CONFIGURED` }
    }
    return {
      configured: true,
      detail: `POST ${path} -> ${res.status()} ${body.slice(0, 80).trim()}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      configured: true,
      detail: `POST ${path} -> erro de rede (${msg}) — sonda inconclusiva, corre na mesma`,
    }
  }
}

/** Mensagem de skip uniforme para "o alvo nao tem Stripe configurado". */
export function stripeSkipReason(detail: string): string {
  return `Stripe nao configurado no alvo (${detail}) — sem STRIPE_SECRET_KEY nao ha Checkout Session nem redirect para checkout.stripe.com. Este teste exige um ambiente com chaves Stripe (test mode); no job de CI sem secrets o resultado correcto e' skip, nao falha.`
}

/** Mensagem uniforme para skips dependentes de seeds. */
export function seedSkipReason(caps: Capabilities, what: string): string {
  const hint = caps.authBlocked
    ? ' O alvo exige HTTP basic auth e E2E_HTTP_USER/E2E_HTTP_PASS não estão definidas (todos os pedidos dão 401).'
    : ''
  return `Sem ${what} no ambiente '${caps.env}' (${caps.baseUrl}) — requer seeds demo; skip para não gerar falso negativo.${hint}`
}

/** Representação compacta das capacidades, para diagnóstico em log. */
export function describeCapabilities(caps: Capabilities): string {
  return [
    `env=${caps.env}`,
    `baseUrl=${caps.baseUrl}`,
    `apiBaseUrl=${caps.apiBaseUrl}`,
    `apiHealthy=${caps.apiHealthy}`,
    `authBlocked=${caps.authBlocked}`,
    `rateLimited=${caps.rateLimited}${caps.rateLimitResetAt ? `(reset=${caps.rateLimitResetAt})` : ''}`,
    `breeders=${caps.breedersTotal}`,
    `services=${caps.servicesTotal}`,
    `hasDemoClient=${caps.hasDemoClient}`,
    `hasDemoBreeder=${caps.hasDemoBreeder}`,
    `hasAdmin=${caps.hasAdmin}`,
  ].join(' ')
}

/** Helper para asserts de envelope de lista da API pública. */
export async function expectJsonOk(res: {
  ok(): boolean
  status(): number
  json(): Promise<unknown>
  text(): Promise<string>
  headers(): Record<string, string>
}): Promise<unknown> {
  expect(res.ok(), `Resposta inesperada: ${res.status()} ${await res.text()}`).toBe(true)
  expect((res.headers()['content-type'] || '').toLowerCase()).toContain('json')
  return res.json()
}
