// Trusted-proxy resolution for Express `trust proxy`.
//
// Security note (L-05 / C-01):
//  * The API must NEVER be exposed directly to the internet — only via
//    Traefik (Dokploy) / nginx. See docker-compose.dokploy.yml and
//    docker-compose.coolify.yml: the `api` service uses `expose` (internal)
//    and never `ports` (host-published).
//  * Even so, we never trust `trust proxy: 1` blindly: trust is granted only
//    to the immediate hop (i === 0) whose socket address is loopback or a
//    private/RFC1918 range (Traefik runs inside Docker), and an
//    IPv4-mapped IPv6 address (`::ffff:`) is never trusted in any
//    position (CVE-2026-90711).
//  * Any client IP that still resolves to an IPv4-mapped IPv6 is normalised
//    back to the socket address by the middleware in index.ts.

export function isTrustedProxyAddress(ip: string): boolean {
  if (typeof ip !== 'string' || ip.length === 0) return false
  const lower = ip.toLowerCase()
  // Never trust IPv4-mapped IPv6 (CVE-2026-90711).
  if (lower.startsWith('::ffff:')) return false

  // Loopback.
  if (ip === '127.0.0.1' || ip === '::1') return true

  // IPv4 private / link-local ranges (Traefik runs inside Docker).
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
  }

  // IPv6 unique-local / link-local.
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('fe80:')) return true

  return false
}

// Normalise an Express-resolved client IP: if it is still an IPv4-mapped IPv6
// (`::ffff:...`), fall back to the socket address so it can never be used as
// a rate-limit key or persisted in audit/consent logs.
export function normalizeClientIp(
  resolvedIp: string | undefined,
  socketAddress: string | undefined,
): string {
  if (typeof resolvedIp === 'string' && resolvedIp.toLowerCase().startsWith('::ffff:')) {
    return socketAddress || resolvedIp
  }
  return resolvedIp || socketAddress || ''
}
