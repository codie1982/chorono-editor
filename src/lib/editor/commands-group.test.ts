import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromPrimitive, newTimeline } from '../defaults'
import type { Layer } from '../types'
import { createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { unionBounds } from '../geometry/boundsMath'
import { makeGroupSiblingLayersCmd } from './branches/HierarchyCommands'
import { makeGroupCmd, makeUngroupCmd } from './commands-group'

/** A rotated/reflected sibling scene with an animated descendant and custom origins. */
function fixture(nested: boolean) {
  const parent: Layer = { ...newRectLayer(), id: 'parent', type: 'group', transform: {
    x: 100, y: -35, rotationDeg: 27, scaleX: -1.4, scaleY: 0.8, anchorX: 18, anchorY: -11 } }
  const shape = { ...newRectLayer(), id: 'shape', parentId: nested ? parent.id : undefined }
  shape.transform = { x: 260, y: 150, rotationDeg: 19, scaleX: 1.7, scaleY: -0.9, anchorX: 35, anchorY: 12 }
  const spline = newSplineLayerFromPrimitive('rectangle', { width: 140, height: 90 })!
  spline.id = 'spline'; spline.parentId = shape.parentId
  spline.transform = { ...spline.transform, x: 540, y: 310, rotationDeg: -16 }
  const timeline = newTimeline()
  timeline.tracks = [{ target: 'layers.shape.transform.x', keyframes: [
    { id: 'start', timeMs: 0, value: 260, easing: { type: 'easeInOut' } },
    { id: 'end', timeMs: 1000, value: 390, easing: { type: 'linear' } },
  ] }]
  return { ...emptyScene(), layers: nested ? [shape, parent, spline] : [shape, spline], timelines: [timeline] }
}

describe('group creation placement', () => {
  it.each([false, true])('preserves every child world matrix at all times and centers the pivot (nested=%s)', nested => {
    const scene = fixture(nested), source = JSON.stringify(scene), ids = ['shape', 'spline']
    const measure = createLayerWorldBoundsResolver(scene, 500)
    const bounds = unionBounds(measure(scene.layers[0]), measure(scene.layers.at(-1)!)!)
    const command = makeGroupSiblingLayersCmd(scene, ids, { timeMs: 500 })!, next = command.execute(scene)
    const group = next.layers.find(layer => layer.id === command.groupId)!
    const pivot = resolveLayerWorldMatrix(group, next, 500).applyToPoint({ x: group.transform.anchorX, y: group.transform.anchorY })
    expect(pivot.x).toBeCloseTo(bounds.x + bounds.width / 2, 8)
    expect(pivot.y).toBeCloseTo(bounds.y + bounds.height / 2, 8)
    for (const time of [0, 123, 500, 950, 1000]) for (const id of ids) {
      const before = resolveLayerWorldMatrix(scene.layers.find(layer => layer.id === id)!, scene, time).toArray()
      const after = resolveLayerWorldMatrix(next.layers.find(layer => layer.id === id)!, next, time).toArray()
      after.forEach((value, i) => expect(value).toBeCloseTo(before[i], 9))
    }
    expect(group.transform.x).toBe(0); expect(group.transform.y).toBe(0)
    expect(next.timelines).toBe(scene.timelines)
    expect(next.layers.find(layer => layer.id === 'shape')?.transform).toBe(scene.layers[0].transform)
    expect(command.undo(next)).toEqual(scene)
    expect(command.execute(command.undo(next))).toEqual(next)
    expect(JSON.stringify(scene)).toBe(source)
  })

  it('uses visible and hidden geometry, keeps single selection centered and round-trips ungroup without displacement', () => {
    const scene = fixture(false); scene.timelines = []
    scene.layers[0] = { ...scene.layers[0], hidden: true }
    const command = makeGroupCmd(['shape', 'spline']), grouped = command.execute(scene)
    const measure = createLayerWorldBoundsResolver({ ...scene, layers: scene.layers.map(layer => ({ ...layer, hidden: false })) })
    const boundsWithHidden = unionBounds(measure(scene.layers[0]), measure(scene.layers[1])!)
    const pivot = grouped.layers.find(layer => layer.id === command.groupId)!.transform
    expect(pivot.anchorX).toBeCloseTo(boundsWithHidden.x + boundsWithHidden.width / 2)
    expect(pivot.anchorY).toBeCloseTo(boundsWithHidden.y + boundsWithHidden.height / 2)
    const ungrouped = makeUngroupCmd(grouped, command.groupId)!.execute(grouped)
    expect(ungrouped.layers).toEqual(scene.layers)
    const single = makeGroupCmd(['spline']), next = single.execute(scene)
    const group = next.layers.find(layer => layer.id === single.groupId)!
    const bounds = createLayerWorldBoundsResolver(scene)(scene.layers[1])!
    expect(group.transform.anchorX).toBeCloseTo(bounds.x + bounds.width / 2)
    expect(group.transform.anchorY).toBeCloseTo(bounds.y + bounds.height / 2)
  })

  it('keeps the centered pivot when rotating and ungrouping a static group', () => {
    const scene = fixture(false); scene.timelines = []
    const command = makeGroupCmd(['shape', 'spline']), grouped = command.execute(scene)
    const rotated = { ...grouped, layers: grouped.layers.map(layer => layer.id === command.groupId
      ? { ...layer, transform: { ...layer.transform, rotationDeg: 42, scaleX: 2, scaleY: 2 } } : layer) }
    const ungrouped = makeUngroupCmd(rotated, command.groupId)!.execute(rotated)
    for (const original of scene.layers) {
      const before = resolveLayerWorldMatrix(rotated.layers.find(layer => layer.id === original.id)!, rotated).toArray()
      const after = resolveLayerWorldMatrix(ungrouped.layers.find(layer => layer.id === original.id)!, ungrouped).toArray()
      after.forEach((value, i) => expect(value).toBeCloseTo(before[i], 8))
    }
  })
})
