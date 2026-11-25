import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '../../defaults'
import { createPolylineSpline, createRectangleSpline } from '../../spline'
import { splineTopologyCommand } from './topologyCommand'
import { assertSplineTopology } from '../../spline/topology'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

/** Three separate spline layers under an animated, rotated/nonuniform parent. */
function fixture() {
  const scene = emptyScene(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
  parent.transform = { ...parent.transform, x: 250, y: 130, rotationDeg: 32, scaleX: 1.4, scaleY: .7 }
  const target = newSplineLayerFromData(createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false))
  const cutters = [20, 80].map(x => newSplineLayerFromData(createPolylineSpline([{ x, y: -40 }, { x, y: 40 }], false)))
  for (const layer of [target, ...cutters]) { layer.parentId = parent.id; layer.transform = { ...layer.transform, x: 25, y: 15, rotationDeg: -18, anchorX: 4, anchorY: -3 } }
  scene.layers = [parent, target, ...cutters]
  scene.timelines = [{ id: 'human', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.parent.transform.x', keyframes: [{ id: 'a', timeMs: 0, value: 250, easing: { type: 'linear' } }, { id: 'b', timeMs: 1000, value: 400, easing: { type: 'linear' } }] }] }]
  return { scene, parent, target, cutters, edge: Object.keys(target.spline!.segments)[0] }
}

describe('scene-aware native Trim / Extend commands', () => {
  it('trims using other visible layers under full parent transforms; one Undo/Redo preserves cutters, paint, TRS/origin and keys', () => {
    const { scene, target, edge, cutters } = fixture(), before = structuredClone(scene)
    const prepared = splineTopologyCommand(scene, target.id, 'edge', [edge], { kind: 'trim', edgeId: edge, t: .5 }, 500), command = prepared.command!
    const next = command.execute(scene), result = next.layers[1]
    assertSplineTopology(result.spline!); expect(result.transform).toEqual(target.transform); expect(result.style).toEqual(target.style); expect(next.timelines).toEqual(scene.timelines)
    expect(Object.keys(result.spline!.contours)).toHaveLength(2)
    const xs = Object.values(result.spline!.points).map(point => point.x).sort((a, b) => a - b)
    expect(xs).toHaveLength(4); xs.forEach((x, i) => expect(x).toBeCloseTo([0, 20, 80, 100][i], 6))
    for (const cutter of cutters) expect(next.layers.find(item => item.id === cutter.id)).toBe(cutter)
    expect(parseSceneJson(JSON.stringify(next)).layers[1].spline).toEqual(result.spline)
    const undone = command.undo(next); expect(undone).toEqual(before); expect(command.execute(undone)).toEqual(next)
  })
  it('extends to the nearest visible boundary, respecting hidden ancestors and visual Solo', () => {
    const { scene, target, edge, cutters } = fixture()
    // Continue right from x=100 to targets further along the same local ray.
    for (const [index, cutter] of Array.from(cutters.entries())) for (const point of Object.values(cutter.spline!.points)) point.x = 120 + index * 60
    const prepare = () => splineTopologyCommand(scene, target.id, 'edge', [edge], { kind: 'extend', edgeId: edge, t: 1 })
    const first = prepare(), next = first.command!.execute(scene)
    expect(Object.values(next.layers[1].spline!.points).some(point => Math.abs(point.x - 120) < 1e-6)).toBe(true)
    expect(first.command!.undo(next)).toEqual(scene)
    cutters[0].hidden = true
    const farther = prepare().command!.execute(scene)
    expect(Object.values(farther.layers[1].spline!.points).some(point => Math.abs(point.x - 180) < 1e-6)).toBe(true)
    target.solo = true
    expect(prepare()).toMatchObject({ command: null, result: { reason: expect.stringContaining('No forward') } })
  })
  it('never adds empty Undo, never edits closed/interior edges and protects stale boundary inputs, locks and coordinate keys', () => {
    const { scene, target, edge, cutters } = fixture(), noForward = splineTopologyCommand(scene, target.id, 'edge', [edge], { kind: 'extend', edgeId: edge, t: 1 })
    expect(noForward.command).toBeNull(); expect(noForward.result.reason).toContain('No forward')
    const trim = () => splineTopologyCommand(scene, target.id, 'edge', [edge], { kind: 'trim', edgeId: edge, t: .5 })
    const stale = trim().command!; cutters[0].hidden = true; expect(() => stale.execute(scene)).toThrow('boundaries changed'); cutters[0].hidden = false
    target.locked = true; expect(trim).toThrow(); target.locked = false
    const point = Object.keys(target.spline!.points)[0]
    scene.timelines[0].tracks.push({ target: `layers.${target.id}.spline.points.${point}.x`, keyframes: [{ id: 'driven', timeMs: 0, value: 0, easing: { type: 'linear' } }] }); expect(trim).toThrow(); scene.timelines[0].tracks.pop()
    scene.initialState = { reader: `layers.${target.id}.spline.segments.${edge}.type` }; expect(trim).toThrow('reference')
    const closed = newSplineLayerFromData(createRectangleSpline({ width: 30, height: 30 })), closedEdge = Object.keys(closed.spline!.segments)[0]
    scene.layers.push(closed)
    expect(() => splineTopologyCommand(scene, closed.id, 'edge', [closedEdge], { kind: 'extend', edgeId: closedEdge, t: 1 })).toThrow('open contour')
  })
})
