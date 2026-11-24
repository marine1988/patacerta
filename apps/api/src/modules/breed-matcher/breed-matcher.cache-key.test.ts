// ============================================
// PataCerta — Breed Matcher: chave de cache
// ============================================
//
// Card PATA-REL-FIX-1 / REL-05. O catálogo de raças mudou de slug
// (`galgo-portugues` -> `podengo-portugues`) e a cache do matcher guardava
// as raças durante 1 h: sem bump de versão, o matcher continuava a
// recomendar a raça antiga (link morto) até a entrada expirar.
//
// Este teste é deliberadamente pequeno: fixa a versão e a forma da chave
// para que um rename do catálogo exija uma decisão explícita (alterar o
// teste) em vez de passar em silêncio. O comentário no controller
// (`BREEDS_CACHE_KEY`) é a outra metade da regra.

import { describe, expect, it, vi } from 'vitest'

// O controller importa prisma/cache no topo; a chave é uma constante, por isso
// os módulos com efeitos colaterais são substituídos (evita abrir um
// PrismaClient sem DATABASE_URL só para ler uma string).
vi.mock('../../lib/prisma.js', () => ({ prisma: {} }))
vi.mock('../../lib/cache.js', () => ({ cacheGetOrSet: vi.fn(), cacheDel: vi.fn() }))

import { BREEDS_CACHE_KEY } from './breed-matcher.controller.js'

describe('breed-matcher — chave de cache das raças', () => {
  it('está versionada e na versão posterior ao rename galgo→podengo', () => {
    expect(BREEDS_CACHE_KEY).toMatch(/^breed-matcher:breeds:v\d+$/)
    const version = Number(BREEDS_CACHE_KEY.split(':v').at(-1))
    // v1 tinha o slug `galgo-portugues`; o rename obrigou a v2.
    expect(version).toBeGreaterThanOrEqual(2)
  })

  it('não partilha a chave com a lista pública de raças', () => {
    // `breeds.controller.ts` usa `breeds:list:vN` com outro payload
    // (todos os campos). Chaves distintas = invalidações independentes.
    expect(BREEDS_CACHE_KEY.startsWith('breeds:list:')).toBe(false)
  })
})
