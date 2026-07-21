import { describe, it, expect } from 'vitest'
import { extractApiError, extractApiErrorInfo, formatValidationDetails } from './errors'

describe('extractApiErrorInfo', () => {
  it('extrai mensagem de um Error nativo', () => {
    const info = extractApiErrorInfo(new Error('boom'), 'fallback')
    expect(info.message).toBe('boom')
    expect(info.code).toBeNull()
    expect(info.status).toBeNull()
    expect(info.canceled).toBe(false)
  })

  it('usa fallback quando o Error não tem mensagem', () => {
    const info = extractApiErrorInfo(new Error(''), 'fallback')
    expect(info.message).toBe('fallback')
  })

  it('usa fallback para valores desconhecidos (não Error, não axios)', () => {
    const info = extractApiErrorInfo({ qualquer: 'coisa' }, 'fallback')
    expect(info.message).toBe('fallback')
    expect(info.code).toBeNull()
  })
})

describe('extractApiError (versão concisa)', () => {
  it('devolve apenas a string da mensagem', () => {
    expect(extractApiError(new Error('boom'), 'fb')).toBe('boom')
    expect(extractApiError(null, 'fb')).toBe('fb')
  })
})

describe('formatValidationDetails', () => {
  it('formata como "campo: mensagem" quando há path', () => {
    const out = formatValidationDetails([{ path: ['email'], message: 'Email inválido' }])
    expect(out).toEqual(['email: Email inválido'])
  })

  it('junta paths aninhados com ponto', () => {
    const out = formatValidationDetails([{ path: ['user', 'name'], message: 'Obrigatório' }])
    expect(out).toEqual(['user.name: Obrigatório'])
  })

  it('omite o prefixo quando não há path', () => {
    const out = formatValidationDetails([{ message: 'Valor inválido' }])
    expect(out).toEqual(['Valor inválido'])
  })

  it('devolve [] para undefined ou lista vazia', () => {
    expect(formatValidationDetails(undefined)).toEqual([])
    expect(formatValidationDetails([])).toEqual([])
  })
})
