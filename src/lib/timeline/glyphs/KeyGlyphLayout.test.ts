import { describe, expect, it } from 'vitest'
import { KeyGlyphLayout, MAX_KEY_DOM_GLYPHS, type KeyGlyphPoint } from './KeyGlyphLayout'

/** Test-only authored-order points; no serialized scene or UI is constructed. */
function points(count: number, project: (index: number) => { x: number; y: number }): KeyGlyphPoint[] {
  return Array.from({ length: count }, (_, sourceIndex) => ({ id: `key-${sourceIndex}`, sourceIndex, ...project(sourceIndex) }))
}

describe('KeyGlyphLayout', () => {
  it('keeps 42000 projected keys individually reachable with viewport-bounded paths', () => {
    const input = points(42000, i => ({ x: i / 42, y: 14 }))
    const layout = new KeyGlyphLayout(input, 1000, 28)
    expect(layout.count).toBe(42000)
    expect(layout.dense).toBe(true)
    expect(layout.cellCount).toBeLessThanOrEqual(126)
    expect(layout.visibleAt(23456)).toBe(input[23456])
    expect(layout.get('key-41999')).toBe(input[41999])
    expect(layout.paths(new Set()).join('').length).toBeLessThan(16000)
    expect(layout.visible.map(point => point.id)).toEqual(input.map(point => point.id))
  })

  it('coalesces exact overlap with last-authored hit while preserving every ordinal', () => {
    const input = points(42000, () => ({ x: 50, y: 14 })), layout = new KeyGlyphLayout(input, 100, 28)
    expect(layout.cellCount).toBe(1)
    expect(layout.hit(50, 14)).toBe(input[41999])
    expect(layout.representative(input[0])).toBe(input[41999])
    expect(layout.visibleAt(0)).toBe(input[0])
    expect(layout.ordinal('key-41999')).toBe(41999)
    expect(layout.hit(10, 14)).toBeUndefined()
    const partial = layout.paths(new Set(['key-0']))
    expect(partial[0]).toBe(''); expect(partial[1]).not.toBe(''); expect(partial[2]).toBe('')
    const full = layout.paths(new Set(input.map(point => point.id)))
    expect(full[0]).toBe(''); expect(full[1]).toBe(''); expect(full[2]).not.toBe('')
  })

  it('preserves summary member selection and finite clipping without source mutation', () => {
    const input: KeyGlyphPoint[] = [{ id: 'a', sourceIndex: 0, x: 0, y: 14, members: ['a', 'b'] },
      { id: 'off', sourceIndex: 1, x: 400, y: 14 }, { id: 'bad', sourceIndex: 2, x: NaN, y: 14 }]
    const layout = new KeyGlyphLayout(input, 100, 28)
    expect(layout.count).toBe(1)
    expect(layout.paths(new Set(['b']))[1]).not.toBe('')
    expect(layout.paths(new Set(['a', 'b']))[2]).not.toBe('')
    expect(layout.get('off')).toBe(input[1])
    expect(layout.ordinal('off')).toBe(-1)
    expect(layout.get('bad')).toBeUndefined()
    expect(input[0].members).toEqual(['a', 'b'])
    expect(new KeyGlyphLayout(input, Infinity, 28).count).toBe(0)
    expect(new KeyGlyphLayout(input, 0, 28).count).toBe(0)
  })

  it('retains sparse mode and uses two-dimensional graph cells', () => {
    expect(new KeyGlyphLayout(points(MAX_KEY_DOM_GLYPHS, i => ({ x: i, y: 14 })), 1000, 28).dense).toBe(false)
    const layout = new KeyGlyphLayout(points(300, i => ({ x: i % 100, y: Math.floor(i / 100) * 24 })), 100, 72)
    expect(layout.cellCount).toBe(39)
    expect(layout.hit(50, 0)?.y).toBe(0)
    expect(layout.hit(50, 48)?.y).toBe(48)
  })
})
