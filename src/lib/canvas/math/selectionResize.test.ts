import { describe, expect, it } from 'vitest'
import type { ChronoScene, Layer, Transform } from '@/lib/types'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { resolveLayerWorldBounds } from '@/lib/geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { unionBounds } from '@/lib/geometry/boundsMath'
import { prepareTransformTargets, scaleTransformTargets, type TransformChange } from './preparedTransforms'
import { selectionResize, MIN_SELECTION_RESIZE_EXTENT } from './selectionResize'

/** A real rectangle with a custom pivot and a predictable world geometry box. */
function rectangle(id: string, transform: Partial<Transform> = {}): Layer {
  return { ...newRectLayer(), id, size: { width: 200, height: 100 },
    transform: { x: 100, y: 50, anchorX: 30, anchorY: 20, rotationDeg: 0, scaleX: 1, scaleY: 1, ...transform } }
}

/** Apply evaluated transforms to a static fixture through the actual scene model. */
function apply(scene: ChronoScene, changes: TransformChange[]): ChronoScene {
  return { ...scene, layers: scene.layers.map(layer => {
    const change = changes.find(item => item.id === layer.id)
    return change ? { ...layer, transform: change.transform } : layer
  }) }
}

describe('common selection bounding-box resize', () => {
  it.each([
    ['nw', { x: 300, y: 150 }], ['n', { x: 200, y: 150 }], ['ne', { x: 100, y: 150 }],
    ['w', { x: 300, y: 100 }], ['e', { x: 100, y: 100 }],
    ['sw', { x: 300, y: 50 }], ['s', { x: 200, y: 50 }], ['se', { x: 100, y: 50 }],
  ] as const)('pins the opposite world point for %s without moving on pointer-down', (handle, pivot) => {
    const bounds = Object.freeze({ x: 100, y: 50, width: 200, height: 100 })
    expect(selectionResize(bounds, handle, { x: 0, y: 0 }, false)).toEqual({ pivot, factorX: 1, factorY: 1 })
  })

  it('keeps the original corner grab offset while scaling real geometry about its opposite corner', () => {
    const layer = rectangle('shape'), scene = { ...emptyScene(), layers: [layer] }
    const bounds = resolveLayerWorldBounds(layer, scene)!
    const pointerDown = { x: 110, y: 55 }, pointerNow = { x: 70, y: 35 }
    const resize = selectionResize(bounds, 'nw', { x: pointerNow.x - pointerDown.x, y: pointerNow.y - pointerDown.y }, false)!
    const prepared = prepareTransformTargets(scene, [layer.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    const scaled = scaleTransformTargets(prepared.targets, resize.pivot, resize.factorX, resize.factorY)
    if (!scaled.ok) throw new Error(scaled.reason)
    const after = apply(scene, scaled.changes), result = resolveLayerWorldBounds(after.layers[0], after)!
    expect(result.x).toBeCloseTo(60)
    expect(result.y).toBeCloseTo(30)
    expect(result.x + result.width).toBeCloseTo(300)
    expect(result.y + result.height).toBeCloseTo(150)
    expect(pointerNow.x - result.x).toBeCloseTo(10)
    expect(pointerNow.y - result.y).toBeCloseTo(5)
    expect(after.layers[0].transform.anchorX).toBe(30)
    expect(after.layers[0].size).toBe(layer.size)
    expect(scene.layers[0]).toBe(layer)
  })

  it('scales a proportional side handle symmetrically about the opposite edge midpoint', () => {
    const layer = rectangle('shape'), scene = { ...emptyScene(), layers: [layer] }
    const prepared = prepareTransformTargets(scene, [layer.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    const resize = selectionResize(resolveLayerWorldBounds(layer, scene)!, 'e', { x: 40, y: 90 }, true)!
    const scaled = scaleTransformTargets(prepared.targets, resize.pivot, resize.factorX, resize.factorY)
    if (!scaled.ok) throw new Error(scaled.reason)
    const after = apply(scene, scaled.changes), bounds = resolveLayerWorldBounds(after.layers[0], after)!
    expect(bounds.x).toBeCloseTo(100)
    expect(bounds.width).toBeCloseTo(240)
    expect(bounds.height).toBeCloseTo(120)
    expect(bounds.y + bounds.height / 2).toBeCloseTo(100)
    expect(resize.factorX).toBe(resize.factorY)
  })

  it('uniformly resizes mixed-parent roots and group descendants once using real union bounds', () => {
    const outer: Layer = { ...rectangle('outer'), type: 'group', size: undefined,
      transform: { x: 100, y: 80, anchorX: 0, anchorY: 0, rotationDeg: 30, scaleX: -2, scaleY: 0.5 } }
    const group: Layer = { ...rectangle('selected-group', { x: 20, y: 10, rotationDeg: 15 }), type: 'group', size: undefined, parentId: outer.id }
    const leaf = { ...rectangle('leaf', { x: 10, y: 20 }), parentId: group.id }
    const other = rectangle('other', { x: 400, y: 150 })
    const scene = { ...emptyScene(), layers: [outer, group, leaf, other] }, before = structuredClone(scene)
    const bounds = unionBounds(resolveLayerWorldBounds(group, scene), resolveLayerWorldBounds(other, scene)!)
    const resize = selectionResize(bounds, 'se', { x: bounds.width / 4, y: bounds.height / 4 }, true)!
    const prepared = prepareTransformTargets(scene, [group.id, leaf.id, other.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    expect(prepared.targets.map(target => target.id)).toEqual([group.id, other.id])
    const scaled = scaleTransformTargets(prepared.targets, resize.pivot, resize.factorX, resize.factorY)
    if (!scaled.ok) throw new Error(scaled.reason)
    const after = apply(scene, scaled.changes)
    for (const item of [leaf, other]) {
      const point = { x: 83, y: 27 }
      const oldPoint = resolveLayerWorldMatrix(item, scene).applyToPoint(point)
      const newPoint = resolveLayerWorldMatrix(after.layers.find(layer => layer.id === item.id)!, after).applyToPoint(point)
      expect(newPoint.x - resize.pivot.x).toBeCloseTo((oldPoint.x - resize.pivot.x) * 1.25)
      expect(newPoint.y - resize.pivot.y).toBeCloseTo((oldPoint.y - resize.pivot.y) * 1.25)
    }
    const result = unionBounds(resolveLayerWorldBounds(after.layers[1], after), resolveLayerWorldBounds(after.layers[3], after)!)
    expect(result.x).toBeCloseTo(bounds.x)
    expect(result.y).toBeCloseTo(bounds.y)
    expect(result.width).toBeCloseTo(bounds.width * 1.25)
    expect(result.height).toBeCloseTo(bounds.height * 1.25)
    expect(after.layers[2]).toBe(leaf)
    expect(after.layers[0]).toBe(outer)
    expect(scene).toEqual(before)
  })

  it('clamps attempted crossing to a noncollapsed extent and rejects invalid bounds or deltas', () => {
    const bounds = { x: 100, y: 50, width: 200, height: 100 }
    const result = selectionResize(bounds, 'e', { x: -1000, y: 0 }, false)!
    expect(result.factorX).toBeGreaterThan(0)
    expect(bounds.width * result.factorX).toBeGreaterThanOrEqual(MIN_SELECTION_RESIZE_EXTENT)
    expect(result.pivot).toEqual({ x: 100, y: 100 })
    for (const invalid of [{ ...bounds, width: 0 }, { ...bounds, height: -1 }, { ...bounds, x: NaN }, { ...bounds, width: MIN_SELECTION_RESIZE_EXTENT / 2 }]) {
      expect(selectionResize(invalid, 'se', { x: 0, y: 0 }, false)).toBeNull()
    }
    expect(selectionResize(bounds, 'se', { x: Infinity, y: 0 }, false)).toBeNull()
    expect(selectionResize({ ...bounds, x: Number.MAX_VALUE, width: Number.MAX_VALUE }, 'e', { x: 0, y: 0 }, false)).toBeNull()
  })
})
