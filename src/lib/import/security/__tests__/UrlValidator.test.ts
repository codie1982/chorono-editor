import { describe, it, expect } from 'vitest'
import { UrlValidator, urlValidator } from '../UrlValidator'

describe('UrlValidator', () => {
  const v = new UrlValidator()

  it('accepts https URLs', () => {
    const r = v.validate('https://cdn.example.com/logo.png')
    expect(r.ok).toBe(true)
    expect(r.url?.hostname).toBe('cdn.example.com')
  })

  it('accepts http only for localhost', () => {
    expect(v.validate('http://localhost:3000/x.svg').ok).toBe(true)
    expect(v.validate('http://127.0.0.1/x.svg').ok).toBe(true)
  })

  it('rejects http for remote hosts', () => {
    const r = v.validate('http://evil.com/x.png')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/localhost/)
  })

  it('rejects dangerous schemes', () => {
    expect(v.validate('javascript:alert(1)').ok).toBe(false)
    expect(v.validate('file:///etc/passwd').ok).toBe(false)
    expect(v.validate('data:text/html,<script>').ok).toBe(false)
    expect(v.validate('ftp://example.com/x').ok).toBe(false)
  })

  it('rejects malformed / relative URLs', () => {
    expect(v.validate('not a url').ok).toBe(false)
    expect(v.validate('/relative/path.png').ok).toBe(false)
  })

  it('reports a reason on rejection', () => {
    const r = v.validate('ftp://example.com/x')
    expect(r.reason).toMatch(/scheme/i)
  })

  it('exports a singleton', () => {
    expect(urlValidator).toBeInstanceOf(UrlValidator)
  })
})
