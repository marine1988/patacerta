import { describe, it, expect } from 'vitest'
import { isTrustedProxyAddress, normalizeClientIp } from './trusted-proxy.js'

describe('isTrustedProxyAddress', () => {
  it('rejeita IPv4-mapped IPv6 (::ffff:) em qualquer forma', () => {
    expect(isTrustedProxyAddress('::ffff:127.0.0.1')).toBe(false)
    expect(isTrustedProxyAddress('::ffff:10.0.0.1')).toBe(false)
    expect(isTrustedProxyAddress('::FFFF:192.168.1.1')).toBe(false)
  })

  it('rejeita input inválido/vazio', () => {
    expect(isTrustedProxyAddress('')).toBe(false)
    // @ts-expect-error
    expect(isTrustedProxyAddress(null)).toBe(false)
    // @ts-expect-error
    expect(isTrustedProxyAddress(undefined)).toBe(false)
  })

  it('aceita loopback', () => {
    expect(isTrustedProxyAddress('127.0.0.1')).toBe(true)
    expect(isTrustedProxyAddress('::1')).toBe(true)
  })

  it('aceita redes privadas RFC1918 / link-local', () => {
    expect(isTrustedProxyAddress('10.0.0.1')).toBe(true)
    expect(isTrustedProxyAddress('172.16.0.1')).toBe(true)
    expect(isTrustedProxyAddress('172.31.255.255')).toBe(true)
    expect(isTrustedProxyAddress('192.168.1.5')).toBe(true)
    expect(isTrustedProxyAddress('169.254.1.1')).toBe(true)
  })

  it('rejeita IPs públicos', () => {
    expect(isTrustedProxyAddress('8.8.8.8')).toBe(false)
    expect(isTrustedProxyAddress('1.1.1.1')).toBe(false)
    expect(isTrustedProxyAddress('203.0.113.5')).toBe(false)
  })

  it('rejeita 172 fora do range privado', () => {
    expect(isTrustedProxyAddress('172.15.0.1')).toBe(false)
    expect(isTrustedProxyAddress('172.32.0.1')).toBe(false)
  })

  it('aceita IPv6 unique-local / link-local', () => {
    expect(isTrustedProxyAddress('fc00::1')).toBe(true)
    expect(isTrustedProxyAddress('fd12:3456:789a::1')).toBe(true)
    expect(isTrustedProxyAddress('fe80::1')).toBe(true)
  })
})

describe('normalizeClientIp', () => {
  it('substitui IPv4-mapped IPv6 pelo IP do socket', () => {
    expect(normalizeClientIp('::ffff:127.0.0.1', '172.18.0.1')).toBe('172.18.0.1')
  })

  it('mantém IP normal quando não é mapped', () => {
    expect(normalizeClientIp('203.0.113.5', '172.18.0.1')).toBe('203.0.113.5')
  })

  it('usa socket address quando resolved é undefined', () => {
    expect(normalizeClientIp(undefined, '172.18.0.1')).toBe('172.18.0.1')
  })

  it('devolve string vazia quando ambos ausentes', () => {
    expect(normalizeClientIp(undefined, undefined)).toBe('')
  })
})
