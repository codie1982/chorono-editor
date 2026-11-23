import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { createPolylineSpline } from '../../spline'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { assertSplineTopology } from '../../spline/topology'
import { splineTopologyCommand, type SplineTopologyAction } from './topologyCommand'

/** One portable source with outer transform/paint/key ownership unrelated to
 * native component tools. The near-collinear middle anchor is simplifiable. */
function fixture(kind: 'addVertex' | 'simplify' | 'smooth') {
  const scene = emptyScene(), layer = newSplineLayerFromData(createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: .05 }, { x: 40, y: 0 }, { x: 60, y: 15 }], false))
  layer.transform = { ...layer.transform, x: 150, y: 90, rotationDeg: 30, scaleX: 2, scaleY: .75, anchorX: 9, anchorY: -3 }; scene.layers = [layer]
  scene.timelines = [{ id: 'outer', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: `layers.${layer.id}.transform.x`, keyframes: [{ id: 'human', timeMs: 0, value: 150, easing: { type: 'linear' } }] }] }]
  const mode = kind === 'addVertex' ? 'edge' as const : 'object' as const, ids = Object.keys(kind === 'addVertex' ? layer.spline!.segments : layer.spline!.subShapes).slice(0, 1)
  const action: SplineTopologyAction = kind === 'addVertex' ? { kind, edgeId: ids[0], t: .35 } : kind === 'simplify' ? { kind, tolerancePx: .2 } : { kind }
  return { scene, layer, mode, ids, action }
}
describe('native Add Vertex / Simplify / Smooth commands', () => {
  it.each(['addVertex', 'simplify', 'smooth'] as const)('%s changes only owned source and survives exact Undo/Redo and portable save/load', kind => {
    const { scene, layer, mode, ids, action } = fixture(kind), before = structuredClone(scene)
    const { command, result } = splineTopologyCommand(scene, layer.id, mode, ids, action)
    expect(command).not.toBeNull(); const next = command!.execute(scene); assertSplineTopology(next.layers[0].spline!)
    expect(next.layers[0].transform).toEqual(layer.transform); expect(next.layers[0].style).toEqual(layer.style)
    expect(next.layers[0].modifierStack).toEqual(layer.modifierStack); expect(next.timelines).toEqual(scene.timelines)
    expect(parseSceneJson(JSON.stringify(next)).layers[0].spline).toEqual(next.layers[0].spline)
    if (kind === 'addVertex') { expect(result.pointId).toBeDefined(); expect(next.layers[0].spline!.points[result.pointId!]).toBeDefined(); expect(result.ids).toHaveLength(2) }
    const undone = command!.undo(next); expect(undone).toEqual(before); expect(command!.execute(undone)).toEqual(next); expect(scene).toEqual(before)
  })
  it.each(['addVertex', 'simplify', 'smooth'] as const)('%s refuses locked/keyed/instance sources and late source replacement atomically', kind => {
    const { scene, layer, mode, ids, action } = fixture(kind), call = () => splineTopologyCommand(scene, layer.id, mode, ids, action)
    layer.locked = true; expect(call).toThrow(); layer.locked = false
    layer.instanceOf = 'other'; expect(call).toThrow(); delete layer.instanceOf
    const point = Object.keys(layer.spline!.points)[1]
    scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${point}.x`, keyframes: [{ id: 'driver', timeMs: 0, value: 20, easing: { type: 'linear' } }] })
    expect(call).toThrow(); scene.timelines[0].tracks.pop()
    const prepared = call().command!, changed = { ...scene, layers: [{ ...layer, spline: structuredClone(layer.spline!) }] }
    expect(() => prepared.execute(changed)).toThrow('changed'); expect(changed.layers[0].spline).toEqual(layer.spline)
  })
  it('refuses implicit selections/wrong mode, and protects a referenced vertex against Simplify removal', () => {
    const { scene, layer, ids, action } = fixture('simplify'), edge = Object.keys(layer.spline!.segments)[0], point = Object.keys(layer.spline!.points)[1]
    expect(() => splineTopologyCommand(scene, layer.id, 'object', [], action)).toThrow('Select')
    expect(() => splineTopologyCommand(scene, layer.id, 'edge', [edge], action)).toThrow('Object mode')
    scene.initialState = { reader: `layers.${layer.id}.spline.points.${point}.x` }
    expect(() => splineTopologyCommand(scene, layer.id, 'object', ids, action)).toThrow('reference')
  })
})
