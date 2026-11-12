import { describe, it, expect } from 'vitest'
import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it('default for empty/null/undefined', () => {
    expect(safeRedirect(null)).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect('')).toBe('/')
  })

  it('keeps relative paths', () => {
    expect(safeRedirect('/area-pessoal')).toBe('/area-pessoal')
    expect(safeRedirect('/criador/123?tab=x')).toBe('/criador/123?tab=x')
  })

  it('blocks absolute and protocol-relative URLs', () => {
    expect(safeRedirect('https://evil.com')).toBe('/')
    expect(safeRedirect('//evil.com')).toBe('/')
    expect(safeRedirect('//evil.com/path')).toBe('/')
  })

  it('blocks backslash bypasses (CVE-2026-53669)', () => {
    expect(safeRedirect('/\\evil.com')).toBe('/')
    expect(safeRedirect('\\evil.com')).toBe('/')
    expect(safeRedirect('/a\\b')).toBe('/')
  })

  it('blocks leading/trailing whitespace and control chars', () => {
    expect(safeRedirect(' /evil.com')).toBe('/')
    expect(safeRedirect('/evil.com ')).toBe('/')
    expect(safeRedirect('/evil\n.com')).toBe('/')
  })

  it('rejects non-string', () => {
    expect(safeRedirect(42 as unknown as string)).toBe('/')
  })
})
