import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NOMINATIM_BASE_URL,
  isPrivateAddress,
  normalizeHostname,
  parseAllowedHosts,
  resolveNominatimBaseUrl,
} from './nominatim-url.js'

describe('resolveNominatimBaseUrl — default', () => {
  it('usa o endpoint público quando a env está ausente ou vazia', () => {
    expect(resolveNominatimBaseUrl(undefined)).toBe(DEFAULT_NOMINATIM_BASE_URL)
    expect(resolveNominatimBaseUrl(null)).toBe(DEFAULT_NOMINATIM_BASE_URL)
    expect(resolveNominatimBaseUrl('')).toBe(DEFAULT_NOMINATIM_BASE_URL)
    expect(resolveNominatimBaseUrl('   ')).toBe(DEFAULT_NOMINATIM_BASE_URL)
  })

  it('aceita o host público sem alterações', () => {
    expect(resolveNominatimBaseUrl('https://nominatim.openstreetmap.org')).toBe(
      'https://nominatim.openstreetmap.org',
    )
  })
})

describe('resolveNominatimBaseUrl — normalização', () => {
  it('remove trailing slashes', () => {
    expect(resolveNominatimBaseUrl('https://nominatim.openstreetmap.org/')).toBe(
      'https://nominatim.openstreetmap.org',
    )
    expect(resolveNominatimBaseUrl('https://nominatim.openstreetmap.org///')).toBe(
      'https://nominatim.openstreetmap.org',
    )
  })

  it('normaliza host em maiúsculas e ponto final', () => {
    expect(resolveNominatimBaseUrl('https://NOMINATIM.OpenStreetMap.org./')).toBe(
      'https://nominatim.openstreetmap.org',
    )
  })

  it('preserva um prefixo de caminho (instância self-hosted)', () => {
    expect(resolveNominatimBaseUrl('https://nominatim.openstreetmap.org/nominatim/')).toBe(
      'https://nominatim.openstreetmap.org/nominatim',
    )
  })

  it('preserva porta explícita', () => {
    expect(resolveNominatimBaseUrl('https://nominatim.openstreetmap.org:8443')).toBe(
      'https://nominatim.openstreetmap.org:8443',
    )
  })
})

describe('resolveNominatimBaseUrl — recusas (SSRF)', () => {
  it('recusa http://', () => {
    expect(() => resolveNominatimBaseUrl('http://nominatim.openstreetmap.org')).toThrow(
      /https:\/\//,
    )
  })

  it('recusa esquemas não-HTTP', () => {
    for (const url of [
      'file:///etc/passwd',
      'gopher://nominatim.openstreetmap.org/',
      'data:text/plain,hi',
    ]) {
      expect(() => resolveNominatimBaseUrl(url)).toThrow(/https:\/\//)
    }
  })

  it('recusa credenciais embutidas no URL', () => {
    expect(() =>
      resolveNominatimBaseUrl('https://nominatim.openstreetmap.org@evil.example.com'),
    ).toThrow(/credenciais|allowlist/)
    expect(() => resolveNominatimBaseUrl('https://user:pass@nominatim.openstreetmap.org')).toThrow(
      /credenciais/,
    )
  })

  it('recusa query string e fragment', () => {
    expect(() => resolveNominatimBaseUrl('https://nominatim.openstreetmap.org?x=1')).toThrow(
      /query string/,
    )
    expect(() => resolveNominatimBaseUrl('https://nominatim.openstreetmap.org#frag')).toThrow(
      /fragment/,
    )
  })

  it('recusa host fora da allowlist', () => {
    expect(() => resolveNominatimBaseUrl('https://evil.example.com')).toThrow(/allowlist/)
  })

  it('recusa endereços internos literais, mesmo quando allowlisted', () => {
    for (const host of [
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.5',
      '172.16.0.1',
      '169.254.169.254',
      '[::1]',
      '[fd00::1]',
      '[::ffff:127.0.0.1]',
    ]) {
      expect(() => resolveNominatimBaseUrl(`https://${host}`)).toThrow(/interno|allowlist/)
      expect(() => resolveNominatimBaseUrl(`https://${host}`, host.replace(/[[\]]/g, ''))).toThrow(
        /interno/,
      )
    }
  })

  it('recusa localhost e sufixos locais', () => {
    for (const host of [
      'localhost',
      'nominatim.localhost',
      'nominatim.local',
      'nominatim.internal',
    ]) {
      expect(() => resolveNominatimBaseUrl(`https://${host}`, host)).toThrow(/host local/)
    }
  })

  it('recusa URL sem hostname', () => {
    expect(() => resolveNominatimBaseUrl('https:///search')).toThrow()
  })

  it('recusa lixo que não é URL absoluto', () => {
    expect(() => resolveNominatimBaseUrl('nominatim.openstreetmap.org')).toThrow(/URL absoluto/)
  })
})

describe('resolveNominatimBaseUrl — NOMINATIM_ALLOWED_HOSTS', () => {
  it('aceita host extra explicitamente allowlisted', () => {
    expect(resolveNominatimBaseUrl('https://geo.example.com', 'geo.example.com')).toBe(
      'https://geo.example.com',
    )
  })

  it('aceita lista CSV e é insensível a maiúsculas/espaços', () => {
    expect(
      resolveNominatimBaseUrl('https://geo.example.com', ' foo.example.com, GEO.Example.com '),
    ).toBe('https://geo.example.com')
  })

  it('não deixa a allowlist extra autorizar http://', () => {
    expect(() => resolveNominatimBaseUrl('http://geo.example.com', 'geo.example.com')).toThrow(
      /https:\/\//,
    )
  })

  it('ignora entradas inválidas em vez de as aceitar', () => {
    expect(parseAllowedHosts('https://evil.example.com, geo.example.com, /path, a@b')).toEqual([
      'geo.example.com',
    ])
    expect(() =>
      resolveNominatimBaseUrl('https://evil.example.com', 'https://evil.example.com'),
    ).toThrow(/allowlist/)
  })
})

describe('helpers', () => {
  it('normalizeHostname baixa para minúsculas e remove pontos finais', () => {
    expect(normalizeHostname('  Example.COM.  ')).toBe('example.com')
  })

  it('isPrivateAddress identifica ranges internos', () => {
    for (const host of [
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '172.31.0.9',
      '192.168.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fe80::1',
      'fd12::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateAddress(host), host).toBe(true)
    }
    for (const host of ['8.8.8.8', '203.0.113.10', '2001:4860:4860::8888', 'example.com']) {
      expect(isPrivateAddress(host), host).toBe(false)
    }
  })
})
