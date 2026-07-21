import { describe, it, expect } from 'vitest'
import { formatPrice, parsePriceToCents, priceUnitSuffix } from './format'

describe('formatPrice', () => {
  it('formata valor fixo em EUR pt-PT sem sufixo', () => {
    expect(formatPrice(1250, 'FIXED')).toBe('12,50€')
  })

  it('anexa sufixo "/ hora" para preço HOURLY', () => {
    expect(formatPrice(1250, 'HOURLY')).toBe('12,50€ / hora')
  })

  it('anexa sufixo "/ sessão" para preço PER_SESSION', () => {
    expect(formatPrice(500, 'PER_SESSION')).toBe('5,00€ / sessão')
  })

  it('mostra sempre duas casas decimais', () => {
    expect(formatPrice(1000, 'FIXED')).toBe('10,00€')
  })
})

describe('priceUnitSuffix', () => {
  it('mapeia as três unidades de preço', () => {
    expect(priceUnitSuffix.FIXED).toBe('')
    expect(priceUnitSuffix.HOURLY).toBe('/ hora')
    expect(priceUnitSuffix.PER_SESSION).toBe('/ sessão')
  })
})

describe('parsePriceToCents', () => {
  it('converte vírgula decimal pt-PT em cêntimos', () => {
    expect(parsePriceToCents('12,50')).toBe(1250)
  })

  it('aceita ponto decimal', () => {
    expect(parsePriceToCents('12.5')).toBe(1250)
  })

  it('faz trim de espaços', () => {
    expect(parsePriceToCents('  10 ')).toBe(1000)
  })

  it('devolve null para string vazia', () => {
    expect(parsePriceToCents('')).toBeNull()
    expect(parsePriceToCents('   ')).toBeNull()
  })

  it('devolve null para valores não numéricos', () => {
    expect(parsePriceToCents('abc')).toBeNull()
  })

  it('devolve null para zero ou negativos', () => {
    expect(parsePriceToCents('0')).toBeNull()
    expect(parsePriceToCents('-5')).toBeNull()
  })
})
