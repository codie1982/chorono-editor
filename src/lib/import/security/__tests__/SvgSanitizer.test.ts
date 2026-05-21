import { describe, it, expect } from 'vitest'
import { SvgSanitizer, svgSanitizer } from '../SvgSanitizer'

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${inner}</svg>`

describe('SvgSanitizer', () => {
  const s = new SvgSanitizer()

  describe('script removal', () => {
    it('removes <script> blocks', () => {
      const r = s.sanitize(wrap('<script>alert(1)</script><rect width="10" height="10"/>'))
      expect(r.svg).not.toContain('<script')
      expect(r.svg).not.toContain('alert(1)')
      expect(r.svg).toContain('<rect')
      expect(r.report.scripts).toBe(1)
    })

    it('removes multiple and multiline scripts', () => {
      const r = s.sanitize(wrap('<script>\nfoo()\n</script><script>bar()</script>'))
      expect(r.report.scripts).toBe(2)
      expect(r.svg).not.toMatch(/foo|bar/)
    })

    it('removes self-closing script tags', () => {
      const r = s.sanitize(wrap('<script src="evil.js"/>'))
      expect(r.report.scripts).toBe(1)
      expect(r.svg).not.toContain('script')
    })
  })

  describe('event handler removal', () => {
    it('strips on* attributes (double, single, unquoted)', () => {
      const r = s.sanitize(wrap('<rect onload="x()" onclick=\'y()\' onmouseover=z width="10" height="10"/>'))
      expect(r.svg).not.toMatch(/onload|onclick|onmouseover/)
      expect(r.report.eventHandlers).toBe(3)
      expect(r.svg).toContain('width="10"')
    })

    it('does not strip legitimate attributes that merely start with "on"-like text', () => {
      const r = s.sanitize(wrap('<rect fill="#fff" width="10" height="10"/>'))
      expect(r.svg).toContain('fill="#fff"')
      expect(r.report.eventHandlers).toBe(0)
    })
  })

  describe('foreignObject removal', () => {
    it('removes <foreignObject> blocks', () => {
      const r = s.sanitize(wrap('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>evil()</script></body></foreignObject><rect/>'))
      expect(r.svg).not.toContain('foreignObject')
      expect(r.svg).not.toContain('evil()')
      expect(r.report.foreignObjects).toBe(1)
    })
  })

  describe('external + javascript URI references', () => {
    it('removes javascript: URIs', () => {
      const r = s.sanitize(wrap('<a href="javascript:alert(1)"><rect/></a>'))
      expect(r.svg).not.toContain('javascript:')
      expect(r.report.externalRefs).toBe(1)
    })

    it('removes external http(s) references', () => {
      const r = s.sanitize(wrap('<image href="https://evil.com/x.png"/><use xlink:href="http://evil.com/y"/>'))
      expect(r.svg).not.toContain('evil.com')
      expect(r.report.externalRefs).toBe(2)
    })

    it('preserves data: URIs and local fragment refs', () => {
      const svg = wrap('<image href="data:image/png;base64,AAAA"/><use xlink:href="#gradient"/>')
      const r = s.sanitize(svg)
      expect(r.svg).toContain('data:image/png;base64,AAAA')
      expect(r.svg).toContain('#gradient')
      expect(r.report.externalRefs).toBe(0)
    })
  })

  describe('XML entity / DOCTYPE protection', () => {
    it('strips DOCTYPE and ENTITY declarations', () => {
      const malicious =
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' + wrap('<rect/>')
      const r = s.sanitize(malicious)
      expect(r.svg).not.toContain('DOCTYPE')
      expect(r.svg).not.toContain('ENTITY')
      expect(r.report.strippedDoctype).toBe(true)
    })
  })

  describe('clean SVGs are untouched', () => {
    it('leaves a benign SVG unchanged and reports no modifications', () => {
      const clean = wrap('<rect x="0" y="0" width="50" height="50" fill="#0af"/><path d="M0 0L10 10"/>')
      const r = s.sanitize(clean)
      expect(r.svg).toBe(clean)
      expect(SvgSanitizer.wasModified(r.report)).toBe(false)
      expect(r.warnings).toEqual([])
    })
  })

  describe('warnings + wasModified', () => {
    it('produces a warning per category and flags modification', () => {
      const r = s.sanitize(wrap('<script>x()</script><rect onload="y()"/>'))
      expect(SvgSanitizer.wasModified(r.report)).toBe(true)
      expect(r.warnings.length).toBeGreaterThanOrEqual(2)
      expect(r.warnings.some(w => /script/i.test(w))).toBe(true)
      expect(r.warnings.some(w => /event handler/i.test(w))).toBe(true)
    })
  })

  it('exports a singleton', () => {
    expect(svgSanitizer).toBeInstanceOf(SvgSanitizer)
  })
})
