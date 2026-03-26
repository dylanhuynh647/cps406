import { describe, expect, it } from 'vitest'

import { escapeHtml, sanitizeForDisplay } from './sanitize'

describe('sanitize utilities', () => {
  it('escapes potentially dangerous HTML', () => {
    const input = `<script>alert('xss')</script>`
    const escaped = escapeHtml(input)

    expect(escaped).not.toContain('<script>')
    expect(escaped).toContain('&lt;script&gt;')
  })

  it('handles nullish values safely', () => {
    expect(sanitizeForDisplay(null)).toBe('')
    expect(sanitizeForDisplay(undefined)).toBe('')
  })

  it('sanitizes normal display text', () => {
    const value = sanitizeForDisplay('hello <b>world</b>')
    expect(value).toBe('hello &lt;b&gt;world&lt;/b&gt;')
  })

  it('escapes quotes and inline event handlers', () => {
    const input = `<a href="#" onclick="alert('x')">link</a>`
    const escaped = sanitizeForDisplay(input)

    expect(escaped).toContain('&lt;a href="#" onclick="alert(\'x\')"&gt;link&lt;/a&gt;')
    expect(escaped).not.toContain('<a')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeForDisplay('')).toBe('')
  })
})