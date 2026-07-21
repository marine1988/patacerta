import { describe, it, expect } from 'vitest'
import { formatRelative } from './dates'

// `now` fixo para testes deterministas (não depende do relógio real).
const NOW = new Date('2026-07-01T12:00:00.000Z')

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatRelative', () => {
  it('devolve "agora mesmo" para menos de 1 minuto', () => {
    expect(formatRelative(ago(30 * SEC), NOW)).toBe('agora mesmo')
  })

  it('usa singular para 1 minuto', () => {
    expect(formatRelative(ago(1 * MIN), NOW)).toBe('há 1 minuto')
  })

  it('usa plural para vários minutos', () => {
    expect(formatRelative(ago(2 * MIN), NOW)).toBe('há 2 minutos')
  })

  it('usa singular para 1 hora', () => {
    expect(formatRelative(ago(1 * HOUR), NOW)).toBe('há 1 hora')
  })

  it('usa plural para várias horas', () => {
    expect(formatRelative(ago(2 * HOUR), NOW)).toBe('há 2 horas')
  })

  it('usa singular para 1 dia', () => {
    expect(formatRelative(ago(1 * DAY), NOW)).toBe('há 1 dia')
  })

  it('usa plural para vários dias (< 7)', () => {
    expect(formatRelative(ago(3 * DAY), NOW)).toBe('há 3 dias')
  })

  it('cai para data absoluta a partir de 7 dias', () => {
    // A partir de 7 dias usa formatDate (pt-PT longo). Não fixamos o texto
    // exato de locale; garantimos apenas que já não é um "há N dias".
    const result = formatRelative(ago(10 * DAY), NOW)
    expect(result).not.toMatch(/^há /)
    expect(result).toContain('2026')
  })
})
