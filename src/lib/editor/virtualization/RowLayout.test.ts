import { describe, expect, it } from 'vitest'
import { RowLayout } from './RowLayout'

describe('RowLayout', () => {
  it('keeps a 3000-row viewport bounded at both ends and in the middle', () => {
    const layout = RowLayout.fixed(3000, 28)
    for (const top of [0, 17000, 83500]) {
      const range = layout.range(top, 300)
      const indices = layout.indices(range)
      expect(indices.length).toBeLessThanOrEqual(25)
      expect(layout.top(range.start)).toBeLessThanOrEqual(Math.min(top, layout.height - 300))
      expect(layout.top(range.end)).toBeGreaterThanOrEqual(Math.min(layout.height, top + 300))
    }
    expect(layout.height).toBe(84000)
  })

  it('uses half-open boundaries and fractional variable heights without losing rows', () => {
    const layout = new RowLayout([22, 28.5, 64, 72])
    expect(layout.range(22, 28.5, 0)).toEqual({ start: 1, end: 2 })
    expect(layout.range(50.4, 1, 0)).toEqual({ start: 1, end: 3 })
    expect(layout.top(4)).toBe(186.5)
  })

  it('retains only explicit interaction owners without changing row order', () => {
    const layout = RowLayout.fixed(3000, 28), range = layout.range(12000, 300)
    const indices = layout.indices(range, [2999, 4, 2999, -1, 3000])
    expect(indices[0]).toBe(4)
    expect(indices[indices.length - 1]).toBe(2999)
    expect(indices.length).toBe(range.end - range.start + 2)
    expect(layout.range(0, 0)).toEqual({ start: 0, end: 0 })
    expect(layout.indices(layout.range(0, 0), [4])).toEqual([4])
  })

  it('handles empty layouts, filtering under stale scroll and invalid geometry', () => {
    expect(new RowLayout([]).range(1200, 300)).toEqual({ start: 0, end: 0 })
    expect(RowLayout.fixed(3, 28).range(84000, 300)).toEqual({ start: 0, end: 0 })
    expect(RowLayout.fixed(3000, 28).range(-2000, 300)).toEqual({ start: 0, end: 0 })
    expect(() => new RowLayout([0])).toThrow(RangeError)
    expect(() => new RowLayout([NaN])).toThrow(RangeError)
    expect(() => RowLayout.fixed(-1, 20)).toThrow(RangeError)
  })
})
