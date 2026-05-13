/**
 * Validações partilhadas entre formulários (registo, reset de password,
 * change-password). Manter a política num único sítio evita divergência
 * entre fluxos — e.g. permitir password mais fraca via reset do que via
 * registo, que e' o problema que esta extracção resolve.
 */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Mínimo 8 caracteres.'
  if (!/[A-Z]/.test(pw)) return 'Deve conter pelo menos uma letra maiúscula.'
  if (!/[a-z]/.test(pw)) return 'Deve conter pelo menos uma letra minúscula.'
  if (!/[0-9]/.test(pw)) return 'Deve conter pelo menos um número.'
  return null
}
