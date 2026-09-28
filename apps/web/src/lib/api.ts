import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

// withCredentials: refresh_token vive em cookie httpOnly emitido pela API
// (path /api/auth, SameSite=strict). Sem isto o browser nao envia o cookie
// e /auth/refresh falha com 401.
export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// =====================================================================
// PATA-BUG-8 — 401 de credenciais de INFRA nao e' 401 de sessao
// =====================================================================
//
// Em stage o host inteiro esta atras do middleware de basic auth do
// Traefik (painel do Dokploy). Como o axios acrescenta
// `Authorization: Bearer <accessToken>` a cada pedido, o Traefik valida
// esse header como se fosse credencial de basic auth, nao reconhece
// `Bearer` e responde:
//
//   401 + `WWW-Authenticate: Basic realm="traefik"` (text/plain)
//
// O pedido nunca chega a API e o browser tambem nao consegue satisfazer o
// challenge, porque o `Authorization` ja' vem definido pela aplicacao.
//
// Tratar isso como "sessao expirada" era o que punha a app em ciclo:
//  401 -> /auth/refresh (PASSA, vai sem `Authorization`) -> repetir o
//  pedido original (leva `Bearer` outra vez) -> 401 -> refresh -> ...
// dezenas de voltas, cada uma a rodar o refresh token, e a pagina em
// branco porque o MaintenanceContext so' renderiza depois de /api/status.
//
// A nossa API devolve sempre JSON e nunca pede basic auth, portanto um 401
// com challenge `Basic` e' de infra: falha rapido e nao toca na sessao.
function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null
  const candidate = headers as { get?: (n: string) => unknown }
  const raw =
    typeof candidate.get === 'function'
      ? (candidate.get(name) ?? (headers as Record<string, unknown>)[name])
      : (headers as Record<string, unknown>)[name]
  return typeof raw === 'string' ? raw : null
}

export function isBasicAuthChallenge(error: unknown): boolean {
  const response = (error as AxiosError | undefined)?.response
  const challenge = headerValue(response?.headers, 'www-authenticate')
  return challenge !== null && /^\s*basic\b/i.test(challenge)
}

/** Config do axios com o marcador interno "este pedido ja' foi repetido". */
type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

/** Token que ESTE pedido levou no header (null se foi sem autenticacao). */
function requestToken(config: RetriableConfig | undefined): string | null {
  const raw = headerValue(config?.headers, 'authorization')
  if (!raw) return null
  const match = /^\s*Bearer\s+(.+)$/i.exec(raw)
  return match?.[1] ?? null
}

function clearSession(): void {
  localStorage.removeItem('access_token')
  localStorage.removeItem('user')
}

// Uma unica navegacao para /entrar por falha de sessao: N pedidos em erro
// (ou N refreshes falhados) nao devem disparar N redirects.
let hasRedirectedToLogin = false

// Preserva o destino actual em `?next=` para que o LoginPage
// possa redirigir o utilizador de volta apos auth bem sucedida.
// Evita perda total de contexto (e.g. utilizador a meio de um
// formulario cujo token expirou). So' aplicamos quando o
// utilizador nao esta ja' numa rota de auth, para nao criar
// loops de redirect.
function redirectToLogin(): void {
  if (hasRedirectedToLogin) return
  hasRedirectedToLogin = true
  const currentPath = window.location.pathname + window.location.search
  const onAuthPage =
    window.location.pathname.startsWith('/entrar') ||
    window.location.pathname.startsWith('/registar') ||
    window.location.pathname.startsWith('/recuperar') ||
    window.location.pathname.startsWith('/verificar')
  // Whitelist de prefixos seguros: paths relativos comecando com '/'
  // mas nao '//' (evita open-redirect via path-relative-scheme) e
  // sem backslash (alguns browsers normalizam '\\evil.com' como
  // host externo).
  const safeNext =
    currentPath.startsWith('/') && !currentPath.startsWith('//') && !currentPath.includes('\\')
      ? currentPath
      : '/'
  const target = onAuthPage ? '/entrar' : `/entrar?next=${encodeURIComponent(safeNext)}`
  window.location.href = target
}

// B-06: Refresh mutex — prevent concurrent refresh calls from multiple 401s
let isRefreshing = false
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = []

// PATA-BUG-8: depois de desistirmos da sessao (token novo rejeitado, ou
// refresh falhado) nao voltamos a refrescar enquanto nada tiver corrido bem.
// Sem isto, os 401 dos pedidos que ja' estavam em voo continuavam a disparar
// refreshes novos, cada um a rodar o refresh token. Qualquer resposta 2xx
// limpa o marcador (ex.: o utilizador voltou a autenticar-se), por isso o
// estado nao fica preso.
let sessionGaveUp = false

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error)
    } else {
      p.resolve(token!)
    }
  })
  failedQueue = []
}

function giveUpOnSession(): void {
  sessionGaveUp = true
  clearSession()
  redirectToLogin()
}

// Response interceptor — handle 401 with queued refresh
api.interceptors.response.use(
  (response) => {
    sessionGaveUp = false
    return response
  },
  async (error) => {
    const originalRequest = error.config as RetriableConfig | undefined
    const status: number | undefined = error.response?.status

    // Auth endpoints publicos (login, register, refresh) podem devolver
    // 401 legitimamente (credenciais erradas, refresh token inexistente).
    // Auto-refresh nestes casos provoca:
    //  1. POST /auth/login -> 401 (credenciais erradas)
    //  2. interceptor faz POST /auth/refresh -> 401 (sem cookie)
    //  3. catch: window.location.href = '/entrar' -> reload, form perdido
    // Resultado: o utilizador nunca ve a mensagem de erro porque a pagina
    // recarrega antes do React renderizar o setError().
    const url: string = originalRequest?.url ?? ''
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/verify-email') ||
      url.includes('/auth/resend-verification') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/reset-password')

    if (status !== 401 || isAuthEndpoint || !originalRequest) {
      return Promise.reject(error)
    }

    // 1. PATA-BUG-8: 401 com challenge de basic auth (middleware do Traefik
    //    em stage) nao vem da API => nao e' sessao expirada. Nao refrescar:
    //    era exactamente isto que alimentava o ciclo infinito. A sessao fica
    //    intacta (o problema e' de infra, nao do utilizador).
    if (isBasicAuthChallenge(error)) {
      return Promise.reject(error)
    }

    // 2. PATA-BUG-8: ja' desistimos da sessao e ainda nao houve uma unica
    //    resposta 2xx. Nao voltar a refrescar nem a repetir pedidos — era o
    //    que transformava um 401 persistente numa tempestade de refresh.
    if (sessionGaveUp) {
      return Promise.reject(error)
    }

    // 3. PATA-BUG-8: 401 num pedido que ja' foi repetido com o token mais
    //    recente e continua proibido. O token novo foi aceite pela API de
    //    refresh, logo o problema nao e' uma sessao expirada, e' de
    //    credenciais/infra. Desiste e faz logout em vez de repetir em ciclo.
    if (originalRequest._retry) {
      giveUpOnSession()
      return Promise.reject(error)
    }

    // 4. PATA-BUG-8: pedido enviado com um token que JA' foi substituido por
    //    um refresh intermedio. Repetir com o token actual, sem gastar outro
    //    refresh — sem isto, cada pedido que responde 401 depois de um
    //    refresh ter terminado dispara um refresh novo e roda outra vez o
    //    refresh token (rajadas de queries em voo => tempestade).
    const currentToken = localStorage.getItem('access_token')
    if (currentToken && currentToken !== requestToken(originalRequest)) {
      originalRequest._retry = true
      originalRequest.headers.Authorization = `Bearer ${currentToken}`
      return api(originalRequest)
    }

    if (isRefreshing) {
      // Another refresh is in progress — queue this request
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            // PATA-BUG-8: o pedido em fila tambem tem de ficar marcado como
            // "ja' refrescou". Sem isto, o pedido repetido voltava a apanhar
            // 401 e a disparar OUTRO refresh — era este o ciclo observado em
            // stage (refresh -> 401 x7 -> refresh -> 401 x5 -> ...).
            originalRequest._retry = true
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(api(originalRequest))
          },
          reject,
        })
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      // O refresh token vive no cookie httpOnly — basta enviar o pedido
      // com withCredentials (axios.create ja o tem). Body vazio.
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
      localStorage.setItem('access_token', data.accessToken)
      sessionGaveUp = false
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
      processQueue(null, data.accessToken)
      return api(originalRequest)
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      giveUpOnSession()
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  },
)
