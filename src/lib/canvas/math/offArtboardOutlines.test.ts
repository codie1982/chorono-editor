import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { OFF_ARTBOARD_LIMITS, isOffArtboardBounds, prepareOffArtboardOutlines } from './offArtboardOutlines'

/** Ordinary editable shape, independent of a renderer or DOM surface. */
function shape(id: string, x: number, y: number) {
  const layer = newRectLayer()
  return { ...layer, id, name: id, size: { width: 40, height: 30 }, transform: { ...layer.transform, x, y, anchorX: 0, anchorY: 0 } }
}

const composition = { width: 100, height: 80 }
const viewport = { x: -100, y: -100, width: 400, height: 300 }

describe('bounded off-artboard editor proxies', () => {
  it('shares exact edge contact and overflow policy with selected frames without admitting invalid geometry', () => {
    expect(isOffArtboardBounds({ x: 0, y: 0, width: 100, height: 80 }, composition)).toBe(false)
    for (const bounds of [{ x: -0.001, y: 0, width: 100, height: 80 }, { x: 0, y: -1, width: 100, height: 80 },
      { x: 1, y: 0, width: 100, height: 80 }, { x: 0, y: 1, width: 100, height: 80 }]) {
      expect(isOffArtboardBounds(bounds, composition)).toBe(true)
    }
    expect(isOffArtboardBounds({ x: -10, y: 0, width: NaN, height: 80 }, composition)).toBe(false)
    expect(isOffArtboardBounds({ x: -10, y: 0, width: -1, height: 80 }, composition)).toBe(false)
  })

  it('includes partial/complete overflow in the visible work area while excluding inside, distant and hidden objects', () => {
    const hidden = { ...shape('hidden', -20, 0), hidden: true }
    const scene = { ...emptyScene(), layers: [shape('inside', 20, 20), shape('partial', 90, 20),
      shape('outside', -60, -50), shape('far', 10000, 0), hidden] }
    const before = JSON.stringify(scene)
    const plan = prepareOffArtboardOutlines(scene, new Set(['outside']), createLayerWorldBoundsResolver(scene), composition, viewport)
    expect(plan.outlines.map(item => item.id)).toEqual(['outside', 'partial'])
    expect(plan.outlines[0]).toMatchObject({ selected: true, bounds: { x: -60, y: -50, width: 40, height: 30 } })
    expect(plan.outlines[1].bounds).toEqual({ x: 90, y: 20, width: 40, height: 30 })
    expect(plan.truncated).toBe(false)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('reuses evaluated parent/group/instance geometry and prioritizes an explicitly selected child', () => {
    const parent = { ...shape('parent', -90, -40), type: 'group' as const, size: undefined,
      transform: { ...shape('parent', 0, 0).transform, x: -90, y: -40, scaleX: -2, scaleY: 1.5, rotationDeg: 25 } }
    const child = { ...shape('child', 10, 10), parentId: parent.id }
    const instance = { ...shape('instance', 120, 0), instanceOf: child.id }
    const scene = { ...emptyScene(), layers: [parent, child, instance] }
    const resolver = createLayerWorldBoundsResolver(scene)
    const plan = prepareOffArtboardOutlines(scene, new Set([child.id]), resolver, composition, { ...viewport, x: -300, width: 600 })
    expect(plan.outlines[0].id).toBe(child.id)
    expect(plan.outlines[0].bounds).toEqual(resolver(child))
    expect(plan.outlines.find(item => item.id === parent.id)?.bounds).toEqual(resolver(parent))
    expect(plan.outlines.find(item => item.id === instance.id)?.bounds).toEqual(resolver(instance))
  })

  it('bounds geometry queries/output without silently dropping a late selected layer', () => {
    const scene = { ...emptyScene(), layers: Array.from({ length: 2000 }, (_, i) => shape(`s${i}`, -60, -50)) }
    const query = vi.fn(() => ({ x: -60, y: -50, width: 40, height: 30 }))
    const plan = prepareOffArtboardOutlines(scene, new Set(['s0']), query, composition, viewport)
    expect(plan.outlines[0].id).toBe('s0')
    expect(plan.outlines.length).toBe(OFF_ARTBOARD_LIMITS.outlines)
    expect(query.mock.calls.length).toBeLessThanOrEqual(OFF_ARTBOARD_LIMITS.queries)
    expect(plan.truncated).toBe(true)
    expect(plan.diagnostics.join(' ')).toContain('limited')
  })

  it('does no geometry work when the work area is nonfinite or collapsed', () => {
    const scene = { ...emptyScene(), layers: [shape('outside', -60, -50)] }, query = vi.fn(() => null)
    expect(prepareOffArtboardOutlines(scene, new Set(), query, composition, { ...viewport, width: 0 }).outlines).toEqual([])
    expect(prepareOffArtboardOutlines(scene, new Set(), query, composition, { ...viewport, x: NaN }).diagnostics.length).toBe(1)
    expect(query).not.toHaveBeenCalled()
  })

  it('reports an unsupported geometry query without crashing the work area or mutating its source', () => {
    const scene = { ...emptyScene(), layers: [shape('bad', -60, -50), shape('valid', -20, 0)] }
    const plan = prepareOffArtboardOutlines(scene, new Set(['bad']), layer => {
      if (layer.id === 'bad') throw new Error('Unsupported path data')
      return { x: -20, y: 0, width: 40, height: 30 }
    }, composition, viewport)
    expect(plan.outlines.map(item => item.id)).toEqual(['valid'])
    expect(plan.diagnostics.join(' ')).toContain('1 off-artboard outline geometry')
    expect(scene.layers[0].transform.x).toBe(-60)
  })
})
