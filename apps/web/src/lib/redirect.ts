/**
 * Valida um destino de redirect pos-login para evitar open-redirect.
 *
 * Apenas paths relativos (comecam com `/`) e que NAO sejam protocol-relative
 * (`//evil.com`) sao aceites. Qualquer URL absoluta, protocol-relative,
 * contendo backslash (alguns browsers normalizam `\evil.com` como host
 * externo — CVE-2025-68470 / CVE-2026-53669) ou caracteres de controlo
 * cai no default `/`.
 */
export function safeRedirect(target: string | null | undefined): string {
  if (!target) return '/'
  if (typeof target !== 'string') return '/'
  // Rejeita caracteres de controlo / whitespace inicial que alguns parsers
  // ignoram (bypass de validacao por prefixo).
  if (target !== target.trim()) return '/'
  if (!target.startsWith('/')) return '/'
  if (target.startsWith('//')) return '/'
  // Evita backslash-tricks que alguns parsers tratam como esquema.
  if (target.includes('\\')) return '/'
  // Rejeita control chars / newlines / tabs embutidos.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(target)) return '/'
  return target
}
