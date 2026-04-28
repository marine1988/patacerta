// ============================================
// PataCerta — Zod Schemas (Common helpers)
// ============================================
//
// Tolerantes a entradas reais de utilizadores: trim, prefixos opcionais,
// normalização para um formato canónico antes de chegar à BD.

import { z } from 'zod'

/**
 * Telefone português (móvel ou fixo).
 *
 * Aceita variantes que utilizadores reais escrevem:
 *   "+351 912 345 678", "+351912345678", "351912345678",
 *   "912 345 678", "912345678", "  912-345-678  "
 *
 * Normaliza sempre para "+351 XXX XXX XXX" antes de devolver. String vazia
 * (ou só espaços) passa para `undefined` para encaixar bem com campos
 * opcionais sem precisar de `.or(z.literal(''))`.
 */
export const portuguesePhoneSchema = z
  .string()
  .trim()
  .transform((raw) => {
    if (!raw) return undefined
    // Strip everything except digits and a leading '+'
    let digits = raw.replace(/[^\d]/g, '')
    // Drop leading "351" / "00351" so resta só o número nacional de 9 dígitos
    if (digits.startsWith('00351')) digits = digits.slice(5)
    else if (digits.startsWith('351')) digits = digits.slice(3)
    return digits
  })
  .refine(
    (digits) => digits === undefined || /^\d{9}$/.test(digits),
    'Telefone inválido. Use 9 dígitos (ex: 912 345 678)',
  )
  .transform((digits) =>
    digits === undefined
      ? undefined
      : `+351 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`,
  )

/**
 * URL opcional. Aceita string vazia (devolve `undefined`), e auto-prepende
 * `https://` se o utilizador escrever só "pata-cao.pt" sem schema.
 */
export const optionalUrlSchema = z
  .string()
  .trim()
  .transform((raw) => {
    if (!raw) return undefined
    if (/^https?:\/\//i.test(raw)) return raw
    return `https://${raw}`
  })
  .refine((val) => {
    if (val === undefined) return true
    try {
      new URL(val)
      return val.length <= 255
    } catch {
      return false
    }
  }, 'URL inválido')
