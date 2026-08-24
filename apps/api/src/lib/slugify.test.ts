import { describe, it, expect } from 'vitest'
import { slugify, ensureUniqueSlug, isNumericId } from './slugify.js'

describe('slugify', () => {
  it('converte espaços em hífens e faz lowercase', () => {
    expect(slugify('Quinta do Monte')).toBe('quinta-do-monte')
  })

  it('remove acentos (pt-PT) via NFD fold', () => {
    expect(slugify('Canil São João — Lisboa')).toBe('canil-sao-joao-lisboa')
    expect(slugify('  Açores & Ilhas  ')).toBe('acores-ilhas')
  })

  it('colapsa hífens consecutivos e apara extremos', () => {
    expect(slugify('a---b')).toBe('a-b')
    expect(slugify('--inicio fim--')).toBe('inicio-fim')
  })

  it('devolve string vazia para input vazio', () => {
    expect(slugify('')).toBe('')
  })

  it('trunca respeitando maxLength', () => {
    const long = 'palavra '.repeat(30).trim()
    const out = slugify(long, 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out).not.toMatch(/-$/) // não termina em hífen
  })
})

describe('isNumericId', () => {
  it('true para IDs numéricos', () => {
    expect(isNumericId('123')).toBe(true)
    expect(isNumericId('1')).toBe(true)
  })

  it('false para slugs textuais', () => {
    expect(isNumericId('canil-lisboa')).toBe(false)
    expect(isNumericId('12a')).toBe(false)
    expect(isNumericId('')).toBe(false)
  })
})

describe('ensureUniqueSlug', () => {
  it('devolve o base quando está livre', async () => {
    const result = await ensureUniqueSlug('canil', async () => false)
    expect(result).toBe('canil')
  })

  it('anexa sufixo incremental em caso de colisão', async () => {
    const taken = new Set(['canil', 'canil-2'])
    const result = await ensureUniqueSlug('canil', async (c) => taken.has(c))
    expect(result).toBe('canil-3')
  })

  it('lança erro se o base for vazio', async () => {
    await expect(ensureUniqueSlug('', async () => false)).rejects.toThrow('base vazio')
  })

  it('lança erro após exceder maxAttempts', async () => {
    // exists devolve sempre true → nunca encontra livre
    await expect(ensureUniqueSlug('x', async () => true, 3)).rejects.toThrow(/nao foi possivel/)
  })
})
