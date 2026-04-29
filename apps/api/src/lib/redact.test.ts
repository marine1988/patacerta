import { describe, it, expect } from 'vitest'
import { maskEmail } from './redact.js'

describe('maskEmail', () => {
  it('mascara o local-part preservando primeira letra e domínio', () => {
    expect(maskEmail('joao.silva@example.com')).toBe('j***@example.com')
  })

  it('preserva subdomínios', () => {
    expect(maskEmail('test@mail.example.co.uk')).toBe('t***@mail.example.co.uk')
  })

  it('emails com local-part de 1 caracter usam *@dominio', () => {
    expect(maskEmail('a@example.com')).toBe('*@example.com')
  })

  it('múltiplos @ — usa o último (formato pseudo-email com tag)', () => {
    // lastIndexOf('@'): "user+tag@x@example.com" -> local "user+tag@x"
    expect(maskEmail('user+tag@x@example.com')).toBe('u***@example.com')
  })

  it('emails inválidos sem @ retornam ***', () => {
    expect(maskEmail('not-an-email')).toBe('***')
  })

  it('emails que começam com @ retornam ***', () => {
    expect(maskEmail('@example.com')).toBe('***')
  })

  it('emails que terminam com @ retornam ***', () => {
    expect(maskEmail('user@')).toBe('***')
  })

  it('string vazia retorna <invalid>', () => {
    expect(maskEmail('')).toBe('<invalid>')
  })

  it('valores não-string retornam <invalid>', () => {
    // @ts-expect-error — testar contrato runtime
    expect(maskEmail(null)).toBe('<invalid>')
    // @ts-expect-error — testar contrato runtime
    expect(maskEmail(undefined)).toBe('<invalid>')
    // @ts-expect-error — testar contrato runtime
    expect(maskEmail(123)).toBe('<invalid>')
  })
})
