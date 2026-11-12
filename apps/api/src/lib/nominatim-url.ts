// ============================================
// PataCerta — Nominatim base URL (SSRF guard)
// ============================================
//
// `NOMINATIM_BASE_URL` é configurada pelo operador (env), não pelo
// utilizador final. Ainda assim, uma env comprometida/mal configurada
// transforma o cliente de geocoding num SSRF primitivo: apontar a base URL
// a `http://169.254.169.254/...` (metadata cloud), `http://redis:6379` ou
// `https://evil.tld` faz a API emitir pedidos server-side para onde o
// operador disser — e o resultado (lat/lon) é persistido na Service row,
// pelo que há um canal de exfiltração limitado.
//
// Este módulo é a única porta de entrada para essa env. Regras (todas
// fail-closed, sem fallback silencioso para um host inesperado):
//   1. Só `https:` — `http:`/`file:`/`gopher:`/`data:` são recusados.
//   2. Sem credenciais no URL (`user:pass@host`) — truque clássico de
//      parsing (`https://nominatim.openstreetmap.org@evil.tld`).
//   3. Sem query string nem fragment (`?`/`#` mudariam o caminho real).
//   4. Host tem de estar numa allowlist: `nominatim.openstreetmap.org`
//      (builtin) + `NOMINATIM_ALLOWED_HOSTS` (lista CSV, opt-in explícito
//      para instâncias self-hosted).
//   5. Endereços literais privados/loopback/link-local e `localhost` são
//      recusados SEMPRE, mesmo que apareçam na allowlist — nenhum caso de
//      uso legítimo justifica apontar a API para dentro da sua própria rede
//      via esta env.
//
// O URL devolvido é normalizado (host em lowercase, sem trailing slash) e é
// o que `lib/geocoding.ts` usa para construir `<base>/search`.
//
// Nota: a validação é feita no import de `geocoding.ts`, o que faz o boot da
// API falhar alto com uma mensagem explícita em vez de degradar em silêncio
// para o default (o `geocodeService` nunca lança — ver contrato no ficheiro).

export const DEFAULT_NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'

/** Hosts aceites sem `NOMINATIM_ALLOWED_HOSTS`. */
const BUILTIN_ALLOWED_HOSTS = ['nominatim.openstreetmap.org']

/** Hosts que nunca são aceites, mesmo via `NOMINATIM_ALLOWED_HOSTS`. */
const ALWAYS_BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain'])

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export class NominatimConfigError extends Error {
  constructor(message: string) {
    super(`[PataCerta] ${message}`)
    this.name = 'NominatimConfigError'
  }
}

/** Normaliza um hostname para comparação: lowercase, sem pontos finais. */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, '')
}

/**
 * Interpreta `NOMINATIM_ALLOWED_HOSTS` (CSV de hostnames). Entradas
 * inválidas são ignoradas em vez de aceites por aproximação; o objectivo é
 * alargar a allowlist de forma explícita, não adivinhar.
 */
export function parseAllowedHosts(raw?: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => normalizeHostname(entry))
    .filter((entry) => entry.length > 0 && HOSTNAME_RE.test(entry))
}

/** True para `localhost`, `*.localhost`, `*.local` (mDNS) e `*.internal`. */
function isLocalHostname(host: string): boolean {
  return (
    ALWAYS_BLOCKED_HOSTS.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
}

/** True se o host for um literal IPv4/IPv6 (com ou sem brackets). */
function isIpLiteral(host: string): boolean {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  return IPV4_RE.test(bare) || bare.includes(':')
}

/**
 * True para endereços que dão acesso à rede interna do host/container:
 * loopback, RFC1918, link-local (incl. 169.254.169.254), CGNAT, IPv6
 * unique-local/link-local e IPv4 mapeado em IPv6 (`::ffff:10.0.0.1`).
 */
export function isPrivateAddress(host: string): boolean {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  const lower = bare.toLowerCase()

  if (lower.includes(':')) {
    // IPv4 mapeado em IPv6 — o URL parser reescreve `::ffff:127.0.0.1` para
    // a forma hexadecimal `::ffff:7f00:1`, pelo que validamos as duas.
    const mappedDotted = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    if (mappedDotted) return isPrivateAddress(mappedDotted[1] as string)
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (mappedHex) {
      const hi = parseInt(mappedHex[1] as string, 16)
      const lo = parseInt(mappedHex[2] as string, 16)
      const v4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
      return isPrivateAddress(v4)
    }
    if (lower === '::' || lower === '::1') return true
    if (lower.startsWith('fe80:')) return true // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local
    return false
  }

  const m = lower.match(IPV4_RE)
  if (!m) return false
  const octets = m.slice(1, 5).map(Number)
  if (octets.some((n) => !Number.isInteger(n) || n > 255)) return false
  const [a = 0, b = 0] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

/**
 * Resolve a base URL do Nominatim a partir da env, validando-a.
 *
 * @param rawUrl              valor de `NOMINATIM_BASE_URL` (`undefined`/vazio → default).
 * @param extraAllowedHosts   valor de `NOMINATIM_ALLOWED_HOSTS` (CSV, opcional).
 * @throws {NominatimConfigError} se o URL não cumprir as regras do topo.
 */
export function resolveNominatimBaseUrl(
  rawUrl?: string | null,
  extraAllowedHosts?: string | null,
): string {
  const raw = rawUrl?.trim()
  if (!raw) return DEFAULT_NOMINATIM_BASE_URL

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new NominatimConfigError(
      `NOMINATIM_BASE_URL inválido (${JSON.stringify(raw)}): não é um URL absoluto válido. ` +
        `Use https://${BUILTIN_ALLOWED_HOSTS[0]}`,
    )
  }

  if (url.protocol !== 'https:') {
    throw new NominatimConfigError(
      `NOMINATIM_BASE_URL tem de usar https:// (recebido "${url.protocol}//"). ` +
        `HTTP e outros esquemas são recusados para impedir SSRF.`,
    )
  }

  if (url.username || url.password) {
    throw new NominatimConfigError(
      'NOMINATIM_BASE_URL não pode conter credenciais (user:pass@host).',
    )
  }

  if (url.search || url.hash) {
    throw new NominatimConfigError('NOMINATIM_BASE_URL não pode conter query string nem fragment.')
  }

  const host = normalizeHostname(url.hostname)
  if (host.length === 0) {
    throw new NominatimConfigError('NOMINATIM_BASE_URL inválido: hostname em falta.')
  }

  if (isIpLiteral(host) && isPrivateAddress(host)) {
    throw new NominatimConfigError(
      `NOMINATIM_BASE_URL aponta para um endereço interno (${host}). ` +
        'Endereços privados/loopback/link-local são sempre recusados.',
    )
  }

  if (isLocalHostname(host)) {
    throw new NominatimConfigError(
      `NOMINATIM_BASE_URL aponta para um host local (${host}). ` +
        'Use o endpoint público ou um host explícito em NOMINATIM_ALLOWED_HOSTS.',
    )
  }

  const allowed = new Set([...BUILTIN_ALLOWED_HOSTS, ...parseAllowedHosts(extraAllowedHosts)])
  if (!allowed.has(host)) {
    throw new NominatimConfigError(
      `NOMINATIM_BASE_URL aponta para um host fora da allowlist (${host}). ` +
        `Hosts aceites: ${[...allowed].sort().join(', ')}. ` +
        'Para uma instância self-hosted, adicione o hostname a NOMINATIM_ALLOWED_HOSTS (CSV).',
    )
  }

  const path = url.pathname.replace(/\/+$/, '')
  // Reconstruir a partir do host normalizado (o `origin` do parser preserva
  // maiúsculas e o ponto final: `https://Host.Org.` → `https://Host.Org.`).
  const port = url.port ? `:${url.port}` : ''
  return `${url.protocol}//${host}${port}${path}`
}
