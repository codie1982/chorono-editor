import { describe, expect, it } from 'vitest'
import { SplineLineDraft } from './SplineLineDraft'

describe('placed Line draft completion policy', () => {
  it('closes at its own start in CSS pixels, with three anchors and no duplicate point', () => {
    const line = new SplineLineDraft({ x: 100, y: 100 })
    expect(line.closesAt({ x: 100, y: 100 }, 1)).toBe(false)
    line.add({ x: 140, y: 100 }); expect(line.closesAt({ x: 100, y: 100 }, 1)).toBe(false)
    expect(line.add({ x: 100, y: 100 })).toBe(false)
    line.add({ x: 140, y: 140 })
    expect(line.closesAt({ x: 104, y: 100 }, 2)).toBe(true)
    expect(line.closesAt({ x: 106, y: 100 }, 2)).toBe(false)
    expect(line.points).toHaveLength(3)
  })
  it('finishes on closed circle anchors in the same target, while keeping cross-layer snaps positional', () => {
    const line = new SplineLineDraft({ x: 0, y: 0 }, { targetId: 'circle' })
    expect(line.finishesAt({ x: 30, y: 0, layerId: 'circle', pointId: 'quarter', openEndpoint: false })).toBe(true)
    expect(line.finishesAt({ x: 30, y: 0, layerId: 'other', pointId: 'quarter', openEndpoint: false })).toBe(false)
    expect(line.canFinish(false)).toBe(false)
    line.add({ x: 30, y: 0 }); expect(line.canFinish(false)).toBe(true)
  })
  it('preserves endpoint-only joins and closes Continue at the opposite existing endpoint', () => {
    const line = new SplineLineDraft({ x: 50, y: 0 }, { endpointId: 'last', closePoint: { x: 0, y: 0 }, existingCount: 2 })
    expect(line.canFinish(false)).toBe(false)
    expect(line.canFinish(false, 'other')).toBe(true)
    expect(line.canFinish(true)).toBe(true)
    expect(line.closesAt({ x: 0, y: 0 }, 1)).toBe(true)
    expect(line.closesAt({ x: 50, y: 0 }, 1)).toBe(false)
  })
  it('owns copied anchors, ignores repeated/nonfinite clicks and only removes uncommitted anchors', () => {
    const first = { x: 0, y: 0 }, next = { x: 20, y: 0 }, line = new SplineLineDraft(first)
    line.add(next); first.x = 99; next.x = 99
    expect(line.points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }])
    expect(line.add({ x: 20, y: 0 })).toBe(false); expect(line.add({ x: NaN, y: 0 })).toBe(false)
    expect(line.backspace()).toBe(1); expect(line.canFinish(false)).toBe(false)
    expect(line.backspace()).toBe(0); expect(line.closesAt({ x: 0, y: 0 }, 1)).toBe(false)
  })
})
