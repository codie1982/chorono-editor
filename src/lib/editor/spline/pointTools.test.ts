import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { createCircleSpline } from '../../spline'
import { copySplineTangents } from '../../spline/edit/tangents'
import { assertSplineTopology } from '../../spline/topology'
import { splineTopologyCommand, type SplineTopologyAction } from './topologyCommand'
import { prepareSplineSourceOperation } from './operations/sourceOperation'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

/** Stable curved source with non-default layer transform and human outer keys. */
function fixture() {
  const scene = emptyScene(), layer = newSplineLayerFromData(createCircleSpline({ radius: 30 }), { name: 'Curve', x: 100, y: 120 })
  layer.transform.rotationDeg = 25; layer.transform.scaleX = 1.7; layer.transform.anchorX = 4
  scene.layers = [layer]
  scene.timelines = [{ id: 'human', durationMs: 1000, layerIds: [layer.id], autoplay: false, loop: false, tracks: [{ target: `layers.${layer.id}.transform.x`, keyframes: [{ id: 'manual', timeMs: 0, value: 100, easing: { type: 'linear' } }] }] }]
  const points = Object.keys(layer.spline!.points), edge = Object.keys(layer.spline!.segments)[0]
  const actions: { mode: 'point' | 'edge'; ids: string[]; action: SplineTopologyAction }[] = [
    { mode: 'point', ids: [points[0]], action: { kind: 'break' } },
    { mode: 'point', ids: points.slice(0, 2), action: { kind: 'fuse' } },
    { mode: 'point', ids: [points[0]], action: { kind: 'resetTangents' } },
    { mode: 'point', ids: [points[1]], action: { kind: 'pasteTangents', tangents: copySplineTangents(layer.spline!, points[0]) } },
    { mode: 'edge', ids: [edge], action: { kind: 'split', t: .3, edgeId: edge } },
  ]
  return { scene, layer, points, actions }
}
describe('guarded native Point/Edge tools', () => {
  it('each source action is one exact Undo/Redo, portable and preserves layer TRS/origin/paint/human keys', () => {
    for (const { mode, ids, action } of fixture().actions) {
      // Use the same source IDs for preparation and execution.
      const { scene, layer } = fixture()
      // Generators allocate IDs; map the requested fixture selection by index.
      const current = mode === 'edge' ? Object.keys(layer.spline!.segments) : Object.keys(layer.spline!.points)
      const selected = action.kind === 'pasteTangents' ? current.slice(1, 2) : current.slice(0, ids.length), preparedAction = action.kind === 'split' ? { ...action, edgeId: selected[0] } : action
      const before = structuredClone(scene), prepared = prepareSplineSourceOperation(scene, layer.id, { kind: 'topology', selection: { mode, ids: selected }, action: preparedAction })
      const command = prepared.command!; expect(command).not.toBeNull()
      const next = command.execute(scene); assertSplineTopology(next.layers[0].spline!)
      expect(next.layers[0].transform).toEqual(layer.transform); expect(next.layers[0].style).toEqual(layer.style); expect(next.timelines).toEqual(scene.timelines)
      expect(next.layers[0].modifierStack).toEqual(layer.modifierStack)
      const restored = parseSceneJson(JSON.stringify(next)); expect(restored.layers[0].spline).toEqual(next.layers[0].spline)
      const undone = command.undo(next); expect(undone).toEqual(before); expect(command.execute(undone)).toEqual(next); expect(scene).toEqual(before)
    }
  })
  it('refuses wrong modes, stale IDs, locks, live geometry readers and even muted coordinate writers', () => {
    const { scene, layer, points, actions } = fixture(), edge = Object.keys(layer.spline!.segments)[0]
    expect(() => splineTopologyCommand(scene, layer.id, 'edge', [edge], { kind: 'break' })).toThrow('Point mode')
    expect(() => splineTopologyCommand(scene, layer.id, 'point', points.slice(0, 1), { kind: 'split' })).toThrow('Edge mode')
    expect(() => splineTopologyCommand(scene, layer.id, 'point', ['missing'], { kind: 'fuse' })).toThrow('selection changed')
    for (const { mode, ids, action } of actions) {
      const call = () => splineTopologyCommand(scene, layer.id, mode, ids, action)
      layer.spline!.points[points[0]].locked = true; expect(call).toThrow('Unlock'); delete layer.spline!.points[points[0]].locked
      scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${points[0]}.x`, keyframes: [{ id: 'driver', timeMs: 0, value: 0, easing: { type: 'linear' } }] })
      expect(call).toThrow(); scene.timelines[0].tracks.pop()
      const prepared = call().command!; layer.hidden = true; expect(() => prepared.execute(scene)).toThrow(); layer.hidden = false
    }
    scene.initialState = { reader: `layers.${layer.id}.spline.segments.${edge}.type` }
    expect(() => splineTopologyCommand(scene, layer.id, 'edge', [edge], { kind: 'split' })).toThrow('reference')
  })
})
