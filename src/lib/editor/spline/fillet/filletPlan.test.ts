import { expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '../../../defaults'
import { createRectangleSpline } from '../../../spline'
import { filletSpline } from '../../../spline/fillet'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'
import { prepareSplineFillet } from './filletPlan'

/** Native ownership fixture: keyed parent plus ordinary root transform keys. */
function fixture() {
  const scene = emptyScene(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }, data = createRectangleSpline({ width: 100, height: 80 })
  parent.transform = { ...parent.transform, x: 200, y: 150, rotationDeg: 25, scaleX: 1.5, scaleY: .8 }
  const layer = newSplineLayerFromData(data, { x: 0, y: 0 }); layer.parentId = 'parent'; scene.layers = [parent, layer]
  scene.timelines = [{ id: 'main', durationMs: 1000, loop: false, autoplay: false, tracks: [{ target: 'layers.parent.transform.x', keyframes: [{ id: 'human', timeMs: 0, value: 220, easing: { type: 'linear' } }] }] }]
  return { scene, layer, data, ids: Object.keys(data.points).slice(0, 2) }
}
it('applies portable source in one native command; retains manual animation, paint, surviving IDs and serialized worker record identity', () => {
  const { scene, layer, data, ids } = fixture(), before = structuredClone(scene), plan = prepareSplineFillet(scene, layer.id, ids, { radiusPx: 8 }, 0)
  const result = structuredClone(filletSpline(plan.request)), prepared = plan.command(result), next = prepared.command.execute(scene)
  expect(scene).toEqual(before); expect(next.timelines).toBe(scene.timelines); expect(next.layers[1].style).toBe(layer.style); expect(next.layers[1].transform).toBe(layer.transform)
  const untouched = Object.keys(data.points).find(id => !ids.includes(id))!
  expect(next.layers[1].spline!.points[untouched]).toBe(data.points[untouched]); expect(prepared.ids).toHaveLength(4)
  expect(prepared.command.undo(next)).toEqual(before); expect(prepared.command.execute(scene)).toEqual(next)
  expect(parseSceneJson(JSON.stringify(next), true)).toEqual(next)
  expect(() => prepared.command.execute({ ...scene })).toThrow('changed')
})
it('rejects native point drivers, hierarchy locks, removed-ID references and stale sources before any write', () => {
  const { scene, layer, data, ids } = fixture()
  scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${ids[0]}.x`, keyframes: [{ id: 'human-point', timeMs: 0, value: 2, easing: { type: 'linear' } }] })
  expect(() => prepareSplineFillet(scene, layer.id, ids, { radiusPx: 10 }, 0)).toThrow(/keyed|timeline/i)
  scene.timelines[0].tracks.pop(); scene.layers[0].locked = true
  expect(() => prepareSplineFillet(scene, layer.id, ids, { radiusPx: 10 }, 0)).toThrow(/unlock/i)
  scene.layers[0].locked = false; data.points[ids[0]].locked = true
  expect(() => prepareSplineFillet(scene, layer.id, ids, { radiusPx: 10 }, 0)).toThrow(/unlock/i)
})
it('refuses semantic references to removed corners before a preview worker is admitted', () => {
  const { scene, layer, ids } = fixture()
  scene.layers[0].name = `layers.${layer.id}.spline.points.${ids[0]}.x`
  expect(() => prepareSplineFillet(scene, layer.id, ids, { radiusPx: 10 }, 0)).toThrow(/reference/i)
})
