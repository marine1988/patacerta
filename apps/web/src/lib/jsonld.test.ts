import { describe, expect, it } from 'vitest'
import { organizationJsonLd } from './jsonld'
import { SOCIAL_LINKS } from './social'

/**
 * `Organization` JSON-LD (PATA-SOCIAL-2).
 *
 * O `sameAs` tem de vir de `lib/social.ts` — se alguém voltar a escrever os
 * URLs à mão neste ficheiro, o footer e o structured data divergem em
 * silêncio (Google deixa de associar os perfis ao domínio).
 */
describe('organizationJsonLd', () => {
  it('expõe exactamente os 3 perfis oficiais em sameAs, na ordem de social.ts', () => {
    const { sameAs } = organizationJsonLd() as { sameAs: string[] }

    expect(sameAs).toEqual([
      'https://www.instagram.com/patacerta.pt/',
      'https://www.youtube.com/@patacerta-pt',
      'https://www.tiktok.com/@patacerta.pt',
    ])
    // Prova da fonte única: é literalmente o mapa de `SOCIAL_LINKS`.
    expect(sameAs).toEqual(SOCIAL_LINKS.map((link) => link.url))
  })

  it('mantém o resto do nó Organization intacto', () => {
    const org = organizationJsonLd() as Record<string, unknown>

    expect(org['@context']).toBe('https://schema.org')
    expect(org['@type']).toBe('Organization')
    expect(org.name).toBe('PataCerta')
    expect(org.knowsLanguage).toBe('pt-PT')
    expect(org.areaServed).toEqual({ '@type': 'Country', name: 'Portugal' })
    expect(String(org.url)).toMatch(/^https?:\/\//)
    expect(String(org.logo)).toMatch(/^https?:\/\/.+\/icon-512\.svg$/)
    expect(typeof org.description).toBe('string')
    expect((org.description as string).length).toBeGreaterThan(20)
  })

  it('não inclui URLs a mais nem duplicados no sameAs', () => {
    const { sameAs } = organizationJsonLd() as { sameAs: string[] }

    expect(sameAs).toHaveLength(SOCIAL_LINKS.length)
    expect(new Set(sameAs).size).toBe(sameAs.length)
    for (const url of sameAs) {
      expect(new URL(url).protocol).toBe('https:')
    }
  })
})
