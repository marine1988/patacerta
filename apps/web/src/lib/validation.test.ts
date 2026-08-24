import { describe, it, expect } from 'vitest'
import { validatePassword } from './validation'

describe('validatePassword', () => {
  it('aceita uma password forte', () => {
    expect(validatePassword('Abcdef12')).toBeNull()
    expect(validatePassword('MinhaPass123')).toBeNull()
  })

  it('rejeita com menos de 8 caracteres', () => {
    expect(validatePassword('Abc123')).toBe('Mínimo 8 caracteres.')
  })

  it('rejeita sem letra maiúscula', () => {
    expect(validatePassword('abcdef12')).toBe('Deve conter pelo menos uma letra maiúscula.')
  })

  it('rejeita sem letra minúscula', () => {
    expect(validatePassword('ABCDEF12')).toBe('Deve conter pelo menos uma letra minúscula.')
  })

  it('rejeita sem número', () => {
    expect(validatePassword('Abcdefgh')).toBe('Deve conter pelo menos um número.')
  })

  it('aplica as regras por ordem (comprimento primeiro)', () => {
    // Falha comprimento antes de verificar maiúsculas
    expect(validatePassword('abc')).toBe('Mínimo 8 caracteres.')
  })
})
