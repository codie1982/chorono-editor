import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { createRectangleSpline, createDonutSpline, mergeSplineData, translateSplineData, splineToPathDefinition } from '../../spline'
import { flattenClosedPath } from '../../geometry/flattenClosedPath'
import { ringArea } from '../../geometry/boolean/rings'
import { evaluateBooleanOperation } from '../../booleanOperations/evaluateOperation'
import { projectBooleanOperations } from '../../booleanOperations/projectOperations'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { makePickBooleanCmd, makeSelectedSplineBooleanCmd } from './pickOperation'
import type { BooleanOperation } from '../../geometry/boolean'

/** Three Objects in one layer; first two overlap, third must survive untouched. */
function fixture() {
  const data = [0, 50, 220].map(x => translateSplineData(createRectangleSpline({ width: 100, height: 100 }), x, 0)).reduce(mergeSplineData)
  const layer = newSplineLayerFromData(data, { x: 0, y: 0 })
  return { scene: { ...emptyScene(), layers: [layer] }, layer, ids: Object.keys(data.subShapes) }
}

describe('direct selected-Object Boolean commands', () => {
  it.each<[BooleanOperation, number]>([['union', 15000], ['subtract', 5000], ['intersect', 5000], ['xor', 10000]])('applies %s with one exact Undo and preserves unselected Objects', (operation, area) => {
    const { scene, layer, ids } = fixture(), saved = structuredClone(scene)
    const command = makeSelectedSplineBooleanCmd(scene, layer.id, ids.slice(0, 2), operation)!
    const next = command.execute(scene), owner = next.layers.find(item => item.booleanOperation)!
    expect(owner.booleanOperation!.inputs).toEqual(ids.slice(0, 2).map(subShapeId => ({ layerId: layer.id, subShapeId })))
    const evaluation = evaluateBooleanOperation(next, owner.booleanOperation!)
    const path = splineToPathDefinition(evaluation.spline)
    expect(Math.abs(flattenClosedPath(path, .25, 20000, 1000).reduce((sum, ring) => sum + ringArea(ring), 0))).toBeCloseTo(area)
    if (operation === 'union') expect(Object.keys(evaluation.spline.contours)).toHaveLength(1)
    const remaining = projectBooleanOperations(next).layers.find(item => item.id === layer.id)!.spline!
    expect(Object.keys(remaining.subShapes)).toEqual([ids[2]])
    expect(next.layers.find(item => item.id === layer.id)!.spline).toBe(layer.spline)
    expect(scene).toEqual(saved); expect(command.undo(next)).toBe(scene)
    expect(command.execute(scene)).toBe(next)
    expect(() => command.execute({ ...scene })).toThrow(/changed/)
    expect(parseSceneJson(JSON.stringify(next)).layers.find(item => item.id === owner.id)?.booleanOperation).toEqual(owner.booleanOperation)
  })
  it('treats one Object as a pick preference and extends an existing recipe with a same-layer Object', () => {
    const { scene, layer, ids } = fixture()
    expect(makeSelectedSplineBooleanCmd(scene, layer.id, [ids[0]], 'union')).toBeNull()
    const first = makeSelectedSplineBooleanCmd(scene, layer.id, ids.slice(0, 2), 'union')!.execute(scene)
    const owner = first.layers.find(item => item.booleanOperation)!
    const command = makePickBooleanCmd(first, layer.id, layer.id, 'union', 0, undefined, { sourceObjectId: ids[2] })!
    const next = command.execute(first), updated = next.layers.find(item => item.id === owner.id)!
    expect(updated.booleanOperation!.inputs).toHaveLength(3)
    expect(next.layers.filter(item => item.booleanOperation)).toHaveLength(1)
    expect(Object.keys(projectBooleanOperations(next).layers.find(item => item.id === layer.id)!.spline!.subShapes)).toHaveLength(0)
    expect(command.undo(next)).toBe(first)
    expect(makePickBooleanCmd(next, layer.id, layer.id, 'union', 0, undefined, { sourceObjectId: ids[2] })).toBeNull()
  })
  it('starts + picking from one selected Object without consuming unselected Objects', () => {
    const { scene, layer, ids } = fixture()
    const command = makePickBooleanCmd(scene, layer.id, layer.id, 'union', 0, undefined,
      { targetObjectIds: [ids[0]], sourceObjectId: ids[1] })!
    const next = command.execute(scene), owner = next.layers.find(item => item.booleanOperation)!
    expect(owner.booleanOperation!.inputs.map(input => input.subShapeId)).toEqual(ids.slice(0, 2))
    expect(Object.keys(projectBooleanOperations(next).layers.find(item => item.id === layer.id)!.spline!.subShapes)).toEqual([ids[2]])
  })
  it('keeps real holes and disconnected elements while removing overlap interiors', () => {
    const data = [0, 200].map(x => translateSplineData(createDonutSpline({ outerRadius: 60, innerRadius: 20 }), x, 0)).reduce(mergeSplineData)
    const layer = newSplineLayerFromData(data), scene = { ...emptyScene(), layers: [layer] }
    const next = makeSelectedSplineBooleanCmd(scene, layer.id, Object.keys(data.subShapes), 'union')!.execute(scene)
    const result = evaluateBooleanOperation(next, next.layers.find(item => item.booleanOperation)!.booleanOperation!).spline
    expect(Object.keys(result.subShapes)).toHaveLength(1)
    expect(Object.keys(result.contours)).toHaveLength(4)
    expect(Object.values(result.contours).every(contour => contour.closed)).toBe(true)
  })
})
