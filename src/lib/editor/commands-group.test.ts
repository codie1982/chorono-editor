import { describe, expect, it } from 'vitest'
import { DEFAULT_TRANSFORM, emptyScene, newRectLayer, newSplineLayerFromPrimitive, newTimeline } from '../defaults'
import type { Layer } from '../types'
import { createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { unionBounds } from '../geometry/boundsMath'
import { makeGroupSiblingLayersCmd } from './branches/HierarchyCommands'
import { makeGroupCmd, makeUngroupCmd } from './commands-group'
import { makePivotCommand } from '../rig2d/commands'

/** A bent sibling rig with a mirrored lower segment and a target moved after binding. */
function groupedRig() {
  const lower = newRectLayer(), upper = newRectLayer(), target = newRectLayer()
  upper.transform = { ...DEFAULT_TRANSFORM, x: 0, y: 0 }
  lower.transform = { ...upper.transform, x: 30, scaleX: -1, rotationDeg: 15 }
  target.transform = { ...upper.transform, x: 50 }
  const base = { ...emptyScene(), layers: [upper, lower, target] }
  const group = makeGroupCmd(base.layers.map(layer => layer.id))
  const grouped = group.execute(base)
  const linked = makePivotCommand(grouped, lower.id, { kind: 'link', driverId: upper.id }).execute(grouped)
  const rigged = makePivotCommand(linked, upper.id, { kind: 'ik', lowerId: lower.id, targetId: target.id }).execute(linked)
  const scene = { ...rigged, layers: rigged.layers.map(layer => layer.id === target.id
    ? { ...layer, transform: { ...layer.transform, x: 37, y: 17 } } : layer) }
  return { scene, groupId: group.groupId, ids: [upper.id, lower.id, target.id] }
}

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

describe('ungrouping pivot links and IK', () => {
  it.each([{ rotationDeg: 0, scale: 1 }, { rotationDeg: 33, scale: 1.5 }])(
    'preserves world matrices, bindings and Undo at rotation $rotationDeg and scale $scale', ({ rotationDeg, scale }) => {
      const { scene, groupId, ids } = groupedRig()
      const moved = { ...scene, layers: scene.layers.map(layer => layer.id === groupId
        ? { ...layer, transform: { ...layer.transform, x: 100, y: 40, rotationDeg, scaleX: scale, scaleY: scale } } : layer) }
      const command = makeUngroupCmd(moved, groupId)!, next = command.execute(moved)
      for (const id of ids) {
        const before = resolveLayerWorldMatrix(moved.layers.find(layer => layer.id === id)!, moved).toArray()
        const after = resolveLayerWorldMatrix(next.layers.find(layer => layer.id === id)!, next).toArray()
        after.forEach((value, i) => expect(value).toBeCloseTo(before[i], 8))
      }
      expect(next.layers.find(layer => layer.id === ids[0])!.twoBoneIK2d).toBe(moved.layers.find(layer => layer.id === ids[0])!.twoBoneIK2d)
      expect(command.undo(next)).toEqual(moved)
    })

  it('transports a locked undriven shoulder to the new axes while preserving the elbow and world pose', () => {
    const { scene, groupId, ids } = groupedRig()
    const limited = makePivotCommand(scene, ids[0], { kind: 'setJointLimit', joint: 'shoulder',
      limit: { enabled: true, minDeg: -20, maxDeg: 50, lockedDeg: 10 } }).execute(scene)
    const both = makePivotCommand(limited, ids[0], { kind: 'setJointLimit', joint: 'elbow',
      limit: { enabled: true, minDeg: -60, maxDeg: 90 } }).execute(limited)
    const moved = { ...both, layers: both.layers.map(l => l.id === groupId
      ? { ...l, transform: { ...l.transform, rotationDeg: 40 } } : l) }
    const cmd = makeUngroupCmd(moved, groupId)!, after = cmd.execute(moved)
    const upper = after.layers.find(l => l.id === ids[0])!
    expect(upper.twoBoneIK2d?.shoulderLimit).toMatchObject({ minDeg: 20, maxDeg: 90, lockedDeg: 50 })
    expect(upper.twoBoneIK2d?.elbowLimit).toEqual(both.layers.find(l => l.id === ids[0])!.twoBoneIK2d?.elbowLimit)
    for (const id of ids) {
      const original = resolveLayerWorldMatrix(moved.layers.find(l => l.id === id)!, moved).toArray()
      resolveLayerWorldMatrix(after.layers.find(l => l.id === id)!, after).toArray().forEach((x, i) => expect(x).toBeCloseTo(original[i], 8))
    }
    expect(cmd.undo(after)).toEqual(moved)
  })

  it('keeps identity-group child animation and rejects lossy or cross-boundary changes', () => {
    const { scene, groupId, ids } = groupedRig()
    const targetTrack = { target: `layers.${ids[2]}.transform.x`, keyframes: [] }
    const animated = { ...scene, timelines: [{ ...newTimeline(), tracks: [targetTrack] }] }
    expect(makeUngroupCmd(animated, groupId)!.execute(animated).timelines[0].tracks[0]).toBe(targetTrack)

    const groupTrack = { target: `layers.${groupId}.transform.x`, keyframes: [] }
    const drivenGroup = { ...scene, timelines: [{ ...newTimeline(), tracks: [groupTrack] }] }
    expect(() => makeUngroupCmd(drivenGroup, groupId)!.execute(drivenGroup)).toThrow(/Bake animated/)
    const stretched = { ...scene, layers: scene.layers.map(layer => layer.id === groupId
      ? { ...layer, transform: { ...layer.transform, scaleX: 2 } } : layer) }
    expect(() => makeUngroupCmd(stretched, groupId)!.execute(stretched)).toThrow(/uniform/)
    const crossing = { ...scene, layers: scene.layers.map(layer => layer.id === ids[2] ? { ...layer, parentId: undefined } : layer) }
    expect(() => makeUngroupCmd(crossing, groupId)!.execute(crossing)).toThrow(/same group/)
  })
})
