import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { createPolylineSpline, createRectangleSpline, createDonutSpline, mergeSplineData } from '../../spline'
import { assertSplineTopology } from '../../spline/topology'
import { splineTopologyCommand } from './topologyCommand'
import { attachSplineLayerCommand, detachSplineObjectsCommand } from './transferCommand'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'

/** One compound spline with human outer keys; geometry topology is unkeyed. */
function fixture(animated = true) {
  const scene = emptyScene(), rectangle = createRectangleSpline({ width: 100, height: 60 }), donut = createDonutSpline({ outerRadius: 30, innerRadius: 10 })
  const layer = newSplineLayerFromData(mergeSplineData(rectangle, donut), { name: 'Compound', x: 150, y: 90 })
  scene.layers = [layer]; scene.timelines = [{ id: 'human', durationMs: 1000, autoplay: false, loop: false, layerIds: [layer.id], tracks: animated ? [{ target: `layers.${layer.id}.transform.x`, keyframes: [
    { id: 'manual-a', timeMs: 0, value: 100, easing: { type: 'linear' } }, { id: 'manual-b', timeMs: 1000, value: 200, easing: { type: 'easeOut' } },
  ] }] : [] }]
  return { scene, layer, rectangle, donut }
}
describe('native spline topology and transfers', () => {
  it('deletes each edit level with one exact Undo/Redo and unchanged outer keys/root', () => {
    for (const mode of ['point', 'edge', 'object'] as const) {
      const { scene, layer, rectangle } = fixture(), ids = mode === 'point' ? Object.keys(rectangle.points).slice(0, 1) : mode === 'edge' ? Object.keys(rectangle.segments).slice(0, 1) : Object.keys(rectangle.subShapes)
      const before = structuredClone(scene), prepared = splineTopologyCommand(scene, layer.id, mode, ids, { kind: 'delete' }), command = prepared.command!
      const next = command.execute(scene); assertSplineTopology(next.layers[0].spline!)
      expect(next.layers[0].id).toBe(layer.id); expect(next.layers[0].transform).toEqual(layer.transform); expect(next.timelines).toEqual(scene.timelines)
      const undone = command.undo(next); expect(undone).toEqual(before); expect(command.execute(undone)).toEqual(next); expect(scene).toEqual(before)
    }
  })
  it('rejects even muted coordinate animation, live geometry readers and locked ancestors', () => {
    const { scene, layer, rectangle } = fixture(), edge = Object.keys(rectangle.segments)[0]
    const action = () => splineTopologyCommand(scene, layer.id, 'edge', [edge], { kind: 'divide' })
    scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.segments.${edge}.control1.x`, keyframes: [{ id: 'geom', timeMs: 0, value: 5, easing: { type: 'linear' } }] })
    expect(action).toThrow(); scene.timelines[0].tracks.pop()
    scene.initialState = { keep: `layers.${layer.id}.spline.segments.${edge}.type` }
    expect(action).toThrow('reference'); scene.initialState = {}
    const parent = { ...layer, id: 'locked-parent', type: 'group' as const, spline: undefined, locked: true }
    layer.parentId = parent.id; scene.layers.unshift(parent)
    expect(action).toThrow('parent hierarchy')
  })
  it('detach preserves every outer track/timing and parent with independent key IDs and exact Undo', () => {
    const { scene, layer, donut } = fixture(), ids = Object.keys(donut.subShapes), prepared = detachSplineObjectsCommand(scene, layer.id, ids)
    const before = structuredClone(scene), next = prepared.command.execute(scene), sibling = next.layers.find(item => item.id === prepared.result.layerId)!
    expect(next.layers).toHaveLength(2); assertSplineTopology(sibling.spline!); assertSplineTopology(next.layers[0].spline!)
    expect(sibling.transform).toEqual(layer.transform); expect(sibling.parentId).toBe(layer.parentId); expect(sibling.style).toEqual(layer.style)
    const copiedTrack = next.timelines[0].tracks.find(track => track.target === `layers.${sibling.id}.transform.x`)!
    expect(copiedTrack.keyframes.map(key => key.timeMs)).toEqual([0, 1000]); expect(copiedTrack.keyframes[0].id).not.toBe('manual-a')
    for (const time of [0, 250, 1000]) {
      const frame = evaluateSceneFrame(next, time)
      expect(frame.overrides.get(`layers.${sibling.id}.transform.x`)).toEqual(frame.overrides.get(`layers.${layer.id}.transform.x`))
    }
    const undone = prepared.command.undo(next); expect(undone).toEqual(before); expect(prepared.command.execute(undone)).toEqual(next)
  })
  it('Attach remaps imported collisions under transformed parents, preserves target IDs/paint and supports one Undo/Redo', () => {
    const { scene, layer, rectangle } = fixture(false), source = newSplineLayerFromData(structuredClone(rectangle), { name: 'Source geometry', x: 330, y: 80 })
    source.transform.rotationDeg = -15; source.transform.scaleX = 1.3
    layer.transform.rotationDeg = 25; layer.transform.scaleY = .8
    scene.layers.push(source); const before = structuredClone(scene)
    const prepared = attachSplineLayerCommand(scene, layer.id, source.id), next = prepared.command.execute(scene)
    expect(next.layers).toHaveLength(1); assertSplineTopology(next.layers[0].spline!); expect(next.layers[0].style).toEqual(layer.style)
    const first = Object.values(source.spline!.points)[0], mapped = prepared.idMaps.points[first.id]
    expect(mapped).not.toBe(first.id)
    const expected = resolveLayerWorldMatrix(source, scene, 0).applyToPoint(first)
    const actual = resolveLayerWorldMatrix(next.layers[0], next, 0).applyToPoint(next.layers[0].spline!.points[mapped])
    expect(actual.x).toBeCloseTo(expected.x); expect(actual.y).toBeCloseTo(expected.y)
    for (const id of Object.keys(layer.spline!.points)) expect(next.layers[0].spline!.points[id]).toBe(layer.spline!.points[id])
    const undone = prepared.command.undo(next); expect(undone).toEqual(before); expect(prepared.command.execute(undone)).toEqual(next)
  })
  it('rejects losing source-only ancestor presentation while permitting a shared parent', () => {
    const { scene, layer, rectangle } = fixture(false), parent = { ...layer, id: 'faded-parent', type: 'group' as const, spline: undefined, opacity: .5 }
    const source = newSplineLayerFromData(rectangle, { name: 'Source', x: 200, y: 20 }); source.parentId = parent.id
    scene.layers.push(parent, source)
    expect(() => attachSplineLayerCommand(scene, layer.id, source.id)).toThrow('source parent')
    layer.parentId = parent.id
    expect(() => attachSplineLayerCommand(scene, layer.id, source.id)).not.toThrow()
  })
  it('preserves geometry recipes and layer time ranges by refusing unsupported transfers', () => {
    const { scene, layer, rectangle, donut } = fixture(false), point = Object.keys(rectangle.points)[0]
    layer.inputExpressions = { version: 1, fields: { [`spline.points.${point}.x`]: { formula: '1+1', value: 2 } } }
    expect(() => detachSplineObjectsCommand(scene, layer.id, Object.keys(donut.subShapes))).toThrow('formulas')
    layer.inputExpressions = undefined
    const source = newSplineLayerFromData(rectangle, { name: 'Timed source', x: 250, y: 0 }); source.startMs = 500; scene.layers.push(source)
    expect(() => attachSplineLayerCommand(scene, layer.id, source.id)).toThrow('time ranges')
  })
  it('rejects unsafe Attach source graphs/animation and stale commands without writing source', () => {
    const { scene, layer } = fixture(false), source = newSplineLayerFromData(createPolylineSpline([{ x: 0, y: 0 }, { x: 40, y: 0 }], false), { name: 'Source', x: 0, y: 0 })
    scene.layers.push(source)
    scene.layers[0] = { ...layer, instanceOf: source.id }
    expect(() => attachSplineLayerCommand(scene, source.id, layer.id)).toThrow()
    scene.layers[0] = layer
    scene.initialState = { reader: `layers.${source.id}.transform.x` }
    expect(() => attachSplineLayerCommand(scene, layer.id, source.id)).toThrow('reference')
    scene.initialState = {}; const prepared = attachSplineLayerCommand(scene, layer.id, source.id)
    expect(() => prepared.command.execute({ ...scene, composition: { ...scene.composition, width: 777 } })).toThrow('changed')
    scene.timelines[0].tracks.push({ target: `layers.${source.id}.transform.x`, keyframes: [{ id: 'source-key', timeMs: 0, value: 5, easing: { type: 'linear' } }] })
    expect(() => attachSplineLayerCommand(scene, layer.id, source.id)).toThrow('static')
  })
})
