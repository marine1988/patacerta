import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheGet, cacheSet, cacheGetOrSet, cacheDel, cacheDelPrefix } from './cache.js'

// Garante que cada teste corre com fallback in-memory limpo. Sem
// REDIS_URL, `getRedis()` devolve null e cache vai sempre para o Map.
// Forçamos isto para isolar de qualquer config local.
beforeEach(() => {
  delete process.env.REDIS_URL
  // Limpa todos os prefixos comuns que os testes usam.
  return cacheDelPrefix('test:')
})

describe('cache (in-memory fallback)', () => {
  it('cacheGet retorna null em chave inexistente', async () => {
    expect(await cacheGet('test:missing')).toBeNull()
  })

  it('cacheSet + cacheGet preservam o valor', async () => {
    await cacheSet('test:key1', { hello: 'world' }, 60_000)
    expect(await cacheGet<{ hello: string }>('test:key1')).toEqual({ hello: 'world' })
  })

  it('preserva tipos primitivos (string, number, boolean, null)', async () => {
    await cacheSet('test:str', 'value', 60_000)
    await cacheSet('test:num', 42, 60_000)
    await cacheSet('test:bool', true, 60_000)
    expect(await cacheGet('test:str')).toBe('value')
    expect(await cacheGet('test:num')).toBe(42)
    expect(await cacheGet('test:bool')).toBe(true)
  })

  it('expira valores após o TTL', async () => {
    vi.useFakeTimers()
    await cacheSet('test:expires', 'old', 1000)
    expect(await cacheGet('test:expires')).toBe('old')
    vi.advanceTimersByTime(1500)
    expect(await cacheGet('test:expires')).toBeNull()
    vi.useRealTimers()
  })

  it('cacheGetOrSet só chama o loader em miss', async () => {
    const loader = vi.fn().mockResolvedValue({ computed: true })
    const r1 = await cacheGetOrSet('test:lazy', 60_000, loader)
    const r2 = await cacheGetOrSet('test:lazy', 60_000, loader)
    expect(r1).toEqual({ computed: true })
    expect(r2).toEqual({ computed: true })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('cacheGetOrSet propaga erro do loader sem cachear', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(cacheGetOrSet('test:err', 60_000, loader)).rejects.toThrow('boom')
    expect(await cacheGet('test:err')).toBeNull()
  })

  it('cacheDel remove a chave', async () => {
    await cacheSet('test:to-delete', 'x', 60_000)
    await cacheDel('test:to-delete')
    expect(await cacheGet('test:to-delete')).toBeNull()
  })

  it('cacheDelPrefix remove apenas chaves com o prefixo', async () => {
    await cacheSet('test:a:1', 1, 60_000)
    await cacheSet('test:a:2', 2, 60_000)
    await cacheSet('test:b:1', 3, 60_000)
    await cacheDelPrefix('test:a:')
    expect(await cacheGet('test:a:1')).toBeNull()
    expect(await cacheGet('test:a:2')).toBeNull()
    expect(await cacheGet('test:b:1')).toBe(3)
  })
})
