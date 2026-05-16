import { describe, it, expect } from 'vitest'
import { SvgStyleParser } from './SvgStyleParser'
import type { SvgElementLike } from './SvgStyleParser'

/** Minimal element stub for testing. */
const el = (attrs: Record<string, string>): SvgElementLike => ({
  tagName: 'rect',
  getAttribute: (k: string) => attrs[k] ?? null,
})

describe('SvgStyleParser', () => {
  const p = new SvgStyleParser()

  it('empty element → undefined fields', () => {
    const s = p.parse(el({}))
    expect(s.fill).toBeUndefined()
    expect(s.stroke).toBeUndefined()
    expect(s.opacity).toBeUndefined()
  })

  // ── Presentation attributes ─────────────────────────────────────────────────

  it('parses fill / stroke from presentation attributes', () => {
    const s = p.parse(el({ fill: '#ff0000', stroke: '#00ff00' }))
    expect(s.fill).toBe('#ff0000')
    expect(s.stroke).toBe('#00ff00')
  })

  it('parses stroke-width as a number', () => {
    expect(p.parse(el({ 'stroke-width': '2.5' })).strokeWidth).toBe(2.5)
    expect(p.parse(el({ 'stroke-width': '4px' })).strokeWidth).toBe(4)
  })

  it('parses opacity as a number', () => {
    expect(p.parse(el({ opacity: '0.5' })).opacity).toBe(0.5)
  })

  // ── Inline style overrides ──────────────────────────────────────────────────

  it('inline style overrides presentation attribute', () => {
    const s = p.parse(el({ fill: '#ff0000', style: 'fill: #00ff00' }))
    expect(s.fill).toBe('#00ff00')
  })

  it('parses multi-property inline style', () => {
    const s = p.parse(el({ style: 'fill: red; stroke: blue; opacity: 0.7' }))
    expect(s.fill).toBe('#ff0000')
    expect(s.stroke).toBe('#0000ff')
    expect(s.opacity).toBe(0.7)
  })

  // ── Colour normalisation ────────────────────────────────────────────────────

  it('expands 3-digit hex to 6', () => {
    expect(p.parse(el({ fill: '#fa3' })).fill).toBe('#ffaa33')
  })

  it('parses rgb()', () => {
    expect(p.parse(el({ fill: 'rgb(255, 128, 0)' })).fill).toBe('#ff8000')
  })

  it('parses CSS named colours', () => {
    expect(p.parse(el({ fill: 'red'   })).fill).toBe('#ff0000')
    expect(p.parse(el({ fill: 'Black' })).fill).toBe('#000000')
  })

  it("recognises 'none'", () => {
    expect(p.parse(el({ fill: 'none' })).fill).toBe('none')
  })

  it('returns undefined for url(#grad) (gradient — handled separately)', () => {
    expect(p.parse(el({ fill: 'url(#grad1)' })).fill).toBeUndefined()
  })

  // ── Stroke caps / joins / dasharray ─────────────────────────────────────────

  it('parses stroke-linecap', () => {
    expect(p.parse(el({ 'stroke-linecap': 'round'  })).strokeLinecap).toBe('round')
    expect(p.parse(el({ 'stroke-linecap': 'butt'   })).strokeLinecap).toBe('butt')
    expect(p.parse(el({ 'stroke-linecap': 'square' })).strokeLinecap).toBe('square')
    expect(p.parse(el({ 'stroke-linecap': 'weird'  })).strokeLinecap).toBeUndefined()
  })

  it('parses stroke-dasharray', () => {
    expect(p.parse(el({ 'stroke-dasharray': '8,4'   })).strokeDasharray).toEqual([8, 4])
    expect(p.parse(el({ 'stroke-dasharray': '2 4'   })).strokeDasharray).toEqual([2, 4])
    expect(p.parse(el({ 'stroke-dasharray': 'none'  })).strokeDasharray).toBeUndefined()
  })
})
