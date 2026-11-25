import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../defaults'
import { CanvasSelectionEligibility } from './CanvasSelectionEligibility'
import { layersInRect, layersInCircle, layersInPolygon, layersUnderPaintBrush } from './canvasShapes'
import { hitTestLayersAt } from '../renderer'
import type { OverrideMap } from '../evaluator'

describe('common viewport selection eligibility', () => {
  it('applies ancestor restrictions, frame overrides and inclusive lifetime without mutating source', () => {
    const parent = { ...newRectLayer(), id: 'p', type: 'group' as const, hidden: true, startMs: 400, endMs: 500 }
    const child = { ...newRectLayer(), id: 'c', parentId: 'p' }, layers = [parent, child]
    expect(new CanvasSelectionEligibility(layers, 450).accepts(child)).toBe(false)
    const overrides: OverrideMap = new Map([['layers.p.hidden', false]])
    expect(new CanvasSelectionEligibility(layers, 400, overrides).accepts(child)).toBe(true)
    expect(new CanvasSelectionEligibility(layers, 500, overrides).accepts(child)).toBe(true)
    expect(new CanvasSelectionEligibility(layers, 501, overrides).accepts(child)).toBe(false)
    for (const [field, value] of [['locked', true], ['frozen', true], ['opacity', 0]] as const) {
      overrides.set(`layers.p.${field}`, value)
      expect(new CanvasSelectionEligibility(layers, 450, overrides).accepts(child)).toBe(false)
      overrides.delete(`layers.p.${field}`)
    }
    expect(parent.hidden).toBe(true)
  })
  it('uses solo subtrees and rejects malformed ancestry without recursion', () => {
    const parent = { ...newRectLayer(), id: 'p', type: 'group' as const, solo: true }
    const child = { ...newRectLayer(), id: 'c', parentId: 'p' }, other = { ...newRectLayer(), id: 'other' }
    const orphan = { ...newRectLayer(), id: 'orphan', parentId: 'missing' }
    const a = { ...newRectLayer(), id: 'a', parentId: 'b' }, b = { ...newRectLayer(), id: 'b', parentId: 'a' }
    const query = new CanvasSelectionEligibility([parent, child, other, orphan, a, b], 0)
    expect(query.accepts(parent)).toBe(true); expect(query.accepts(child)).toBe(true); expect(query.accepts(other)).toBe(false)
    const unrestricted = new CanvasSelectionEligibility([orphan, a, b], 0)
    expect(unrestricted.accepts(orphan)).toBe(false); expect(unrestricted.accepts(a)).toBe(false); expect(unrestricted.accepts(b)).toBe(false)
  })
  it('makes body and every region style agree on a hidden parent/transparent object', () => {
    const parent = { ...newRectLayer(), id: 'p', type: 'group' as const, hidden: true }
    const child = { ...newRectLayer(), id: 'c', parentId: 'p' }
    const transparent = { ...newRectLayer(), id: 't', opacity: 0 }
    const source = { ...emptyScene(), layers: [parent, child, transparent] }, before = JSON.stringify(source)
    expect(hitTestLayersAt(source, 0, 20, 20)).toEqual([])
    expect(layersInRect(source, { x: -1000, y: -1000, w: 2000, h: 2000 })).toEqual(new Set())
    expect(layersInCircle(source, { x: 0, y: 0, r: 2000 })).toEqual(new Set())
    expect(layersInPolygon(source, [{ x: -1000, y: -1000 }, { x: 1000, y: -1000 }, { x: 0, y: 2000 }])).toEqual(new Set())
    expect(layersUnderPaintBrush(source, { x: 20, y: 20 }, 1000)).toEqual(new Set())
    expect(JSON.stringify(source)).toBe(before)
  })
})
