import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { createRectangleSpline, splineToPathDefinition } from '../../spline'
import { flattenClosedPath } from '../../geometry/flattenClosedPath'
import { ringArea } from '../../geometry/boolean/rings'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { projectBooleanOperations } from '../../booleanOperations/projectOperations'
import { assertSceneBooleanOperations } from '../../booleanOperations/validation'
import { assertSplineTopology } from '../../spline/topology'
import { makePickBooleanCmd, makeSetBooleanOperationCmd } from './pickOperation'
import { makeMergeBooleanPathsCmd, makeSeparateBooleanInputsCmd } from './operationCommands'
import type { BooleanOperation } from '../../geometry/boolean'
import type { ChronoScene } from '../../types'

/** Closed, overlapping stroke-only inputs; paint must not define Boolean area. */
function fixture() {
  const scene = emptyScene()
  scene.layers = [0, 50, 150].map((x, index) => ({ ...newSplineLayerFromData(createRectangleSpline({ width: 100, height: 100 }), { x, y: 0 }), id: ['a', 'b', 'c'][index] }))
  return scene
}
function owner(scene: ChronoScene) { return scene.layers.find(layer => layer.booleanOperation)! }
function result(scene: ChronoScene) { return projectBooleanOperations(scene).layers.find(layer => layer.id === owner(scene).booleanOperation!.resultLayerId)! }
function area(scene: ChronoScene) {
  const path = splineToPathDefinition(result(scene).spline!)
  return path.commands.length ? Math.abs(flattenClosedPath(path, .25, 20000, 1000).reduce((sum, ring) => sum + ringArea(ring), 0)) : 0
}

describe('shared picked Boolean operations and editable materialization', () => {
  it.each<[BooleanOperation, number]>([['union', 15000], ['subtract', 5000], ['intersect', 5000], ['xor', 10000]])('retains inputs, evaluates %s and changes mode in one Undo', (operation, expected) => {
    const scene = fixture(), before = structuredClone(scene), command = makePickBooleanCmd(scene, 'a', 'b', operation)!
    const next = command.execute(scene)
    expect(scene).toEqual(before); expect(area(next)).toBe(expected)
    for (const id of ['a', 'b']) expect(next.layers.find(layer => layer.id === id)?.spline).toBe(scene.layers.find(layer => layer.id === id)!.spline)
    expect(command.undo(next)).toBe(scene)
    expect(command.execute(command.undo(next))).toEqual(next)
    expect(area(parseSceneJson(JSON.stringify(next)))).toBe(expected)
    const change = makeSetBooleanOperationCmd(next, owner(next).id, 'union')
    expect(area(change.execute(next))).toBe(15000); expect(change.undo(change.execute(next))).toBe(next)
    expect(() => command.execute({ ...scene })).toThrow(/changed/)
  })
  it('extends the same recipe, preserves new source world placement and leaves unrelated layers untouched', () => {
    const initial = fixture(), first = makePickBooleanCmd(initial, 'a', 'b', 'union')!.execute(initial)
    const next = { ...first, layers: first.layers.map(layer => layer.booleanOperation ? { ...layer, transform: { ...layer.transform, x: 12, rotationDeg: 17, scaleX: 1.2, scaleY: 1.2 } } : layer) }
    const c = next.layers.find(layer => layer.id === 'c')!, point = Object.values(c.spline!.points)[0]
    const before = resolveLayerWorldMatrix(c, next).applyToPoint(point)
    const command = makePickBooleanCmd(next, 'a', 'c', 'union')!, added = command.execute(next)
    expect(owner(added).id).toBe(owner(next).id); expect(owner(added).booleanOperation!.inputs.map(input => input.layerId)).toEqual(['a', 'b', 'c'])
    const after = resolveLayerWorldMatrix(added.layers.find(layer => layer.id === 'c')!, added).applyToPoint(point)
    expect(after.x).toBeCloseTo(before.x, 8); expect(after.y).toBeCloseTo(before.y, 8)
    expect(command.undo(added)).toBe(next); assertSceneBooleanOperations(added)
    expect(makePickBooleanCmd(added, 'a', 'b', 'union')).toBeNull()
  })
  it('merges holes/islands to ordinary editable source, retains result animation and undoes exactly', () => {
    const scene = fixture(); scene.layers[1].transform.x = 0
    scene.layers[1].transform.scaleX = .4; scene.layers[1].transform.scaleY = .4
    const applied = makePickBooleanCmd(scene, 'a', 'b', 'subtract')!.execute(scene)
    const id = owner(applied).booleanOperation!.resultLayerId, generated = result(applied)
    const keyed = { ...applied, timelines: [{ id: 'main', durationMs: 1000, loop: false, autoplay: false,
      tracks: [{ target: `layers.${id}.transform.x`, keyframes: [{ id: 'keep-key', timeMs: 0, value: 12, easing: { type: 'linear' as const } }] }] }] }
    const plan = makeMergeBooleanPathsCmd(keyed, owner(keyed).id), merged = plan.command.execute(keyed)
    expect(plan.layerId).toBe(id); expect(merged.layers.some(layer => layer.booleanOperation || layer.booleanResultFor)).toBe(false)
    const spline = merged.layers.find(layer => layer.id === id)!.spline!
    expect(Object.keys(spline.contours)).toHaveLength(2); assertSplineTopology(spline)
    expect(splineToPathDefinition(spline)).toEqual(splineToPathDefinition(generated.spline!))
    expect(Object.values(spline.subShapes).every(sub => sub.editable && sub.source === 'edited')).toBe(true)
    expect(merged.timelines).toEqual(keyed.timelines)
    expect(merged.layers.find(layer => layer.id === 'c')).toBe(scene.layers[2])
    expect(plan.command.undo(merged)).toBe(keyed)
    expect(parseSceneJson(JSON.stringify(merged)).layers.find(layer => layer.id === id)?.spline).toEqual(spline)
    expect(() => makeSeparateBooleanInputsCmd(keyed, owner(keyed).id)).toThrow(/readers|animation/)
  })
  it('merges valid empty output and restores original components with Separate + Undo', () => {
    const scene = fixture(); scene.layers[1].transform.x = 0
    const applied = makePickBooleanCmd(scene, 'a', 'b', 'xor')!.execute(scene)
    const merged = makeMergeBooleanPathsCmd(applied, owner(applied).id)
    expect(merged.command.execute(applied).layers.find(layer => layer.id === merged.layerId)?.spline?.points).toEqual({})
    const separate = makeSeparateBooleanInputsCmd(applied, owner(applied).id), restored = separate.command.execute(applied)
    expect(restored.layers.some(layer => layer.booleanOperation || layer.booleanResultFor)).toBe(false)
    for (const id of ['a', 'b']) expect(restored.layers.find(layer => layer.id === id)).toEqual(applied.layers.find(layer => layer.id === id))
    expect(separate.command.undo(restored)).toBe(applied)
  })
  it('refuses unsafe stacking, ownership, animated owner reparenting and inherited protection atomically', () => {
    const scene = fixture(); expect(() => makePickBooleanCmd(scene, 'a', 'c', 'union')).toThrow(/contiguous/)
    const applied = makePickBooleanCmd(scene, 'a', 'b', 'union')!.execute(scene), id = owner(applied).id
    const locked = { ...applied, layers: applied.layers.map(layer => layer.id === id ? { ...layer, locked: true } : layer) }
    expect(() => makeMergeBooleanPathsCmd(locked, id)).toThrow(/Unlock/)
    expect(() => assertSceneBooleanOperations(locked)).not.toThrow()
    const parent = { ...scene.layers[0], id: 'locked-parent', type: 'group' as const, spline: undefined, locked: true }
    const protectedScene = { ...scene, layers: [parent, ...scene.layers.map(layer => ({ ...layer, parentId: parent.id }))] }
    expect(() => makePickBooleanCmd(protectedScene, 'a', 'b', 'union')).toThrow(/parents/)
    const animated = { ...applied, timelines: [{ id: 'main', durationMs: 1000, loop: false, autoplay: false, tracks: [{ target: `layers.${id}.transform.x`, keyframes: [] }] }] }
    expect(() => makePickBooleanCmd(animated, 'a', 'c', 'union')).toThrow(/animated/)
    expect(owner(applied).booleanOperation!.inputs).toHaveLength(2)
  })
})
