import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '../../../defaults'
import { createCircleSpline, hitTestSplineSegment } from '../../../spline'
import { assertSplineTopology, deleteSplineEdges } from '../../../spline/topology'
import { PlanarOutlineBackend, outlineToSpline, type OutlineSettings } from '../../../spline/outline'
import { PathSampler } from '../../../path/PathSampler'
import { Matrix2D } from '../../../geometry/Matrix2D'
import { prepareSplineOutline, outlineSelection } from './outlinePlan'
import { resolveLayerWorldMatrix } from '../../../geometry/resolveLayerWorldMatrix'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'

const settings: OutlineSettings = { side: 'right', distancePx: 15, tolerancePx: .25, join: 'miter', miterLimit: 4 }
/** Animated nonuniform parent with a manually cut circular spline. */
function fixture() {
  const circle = createCircleSpline({ radius: 70 }), data = deleteSplineEdges(circle, [Object.keys(circle.segments)[0]])
  const scene = emptyScene(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
  parent.transform = { ...parent.transform, x: 200, y: 150, rotationDeg: 25, scaleX: 1.5, scaleY: .8 }
  const layer = newSplineLayerFromData(data, { x: 0, y: 0 }); layer.parentId = 'parent'
  scene.layers = [parent, layer]
  scene.timelines = [{ id: 'main', durationMs: 1000, loop: false, autoplay: false, tracks: [{ target: 'layers.parent.transform.x', keyframes: [{ id: 'manual', timeMs: 0, value: 220, easing: { type: 'linear' } }] }] }]
  return { scene, layer, data, ids: Object.keys(data.subShapes) }
}

describe('native Outline source preparation and commit', () => {
  it('matches true world Bézier normal displacements under nonuniform, rotated and reflected parents', () => {
    for (const reflected of [false, true]) {
      const { scene, layer, ids } = fixture(); scene.layers[0].transform.scaleX = reflected ? -1.5 : 1.5; layer.transform.rotationDeg = -13
      const plan = prepareSplineOutline(scene, layer.id, 'object', ids, settings, 0), result = new PlanarOutlineBackend().compute(plan.request)
      const generated = outlineToSpline(result, Matrix2D.identity(), layer.spline!.fillRule)
      const reference = new PathSampler().buildLengthTable(plan.request.inputs[0].path, 64)
      for (const p of reference.samples.slice(1)) {
        const expected = { x: p.x - p.tangentY * settings.distancePx, y: p.y + p.tangentX * settings.distancePx }
        expect(hitTestSplineSegment(generated, expected.x, expected.y, settings.tolerancePx)).not.toBeNull()
      }
    }
  })
  it('previews in world pixels, appends fresh inverse-transformed records and preserves all original curves/keys with one Undo/Redo', () => {
    const { scene, layer, data, ids } = fixture(), before = structuredClone(scene)
    const plan = prepareSplineOutline(scene, layer.id, 'object', ids, settings, 0), result = new PlanarOutlineBackend().compute(plan.request)
    expect(scene).toEqual(before)
    const prepared = plan.command(result), next = prepared.command.execute(scene), spline = next.layers[1].spline!
    assertSplineTopology(spline)
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const id of Object.keys(data[family])) expect(spline[family][id]).toBe(data[family][id])
    expect(prepared.ids).toHaveLength(1); expect(prepared.ids[0]).not.toBe(ids[0])
    expect(next.timelines).toBe(scene.timelines); expect(next.layers[1].transform).toBe(layer.transform); expect(next.layers[1].style).toBe(layer.style)
    const contour = spline.contours[spline.subShapes[prepared.ids[0]].contourIds[0]], output = contour.pointIds.map(id => resolveLayerWorldMatrix(next.layers[1], next, 0).applyToPoint(spline.points[id]))
    result.objects[0].contours[0].points.forEach((point, i) => { expect(output[i].x).toBeCloseTo(point.x, 8); expect(output[i].y).toBeCloseTo(point.y, 8) })
    expect(prepared.command.undo(next)).toEqual(before); expect(prepared.command.execute(scene)).toEqual(next)
    expect(parseSceneJson(JSON.stringify(next), true)).toEqual(next)
  })
  it('promotes selected edges to complete contours, refusing Point mode and keyed/locked/singular/stale sources atomically', () => {
    const { scene, layer, data, ids } = fixture(), edge = Object.keys(data.segments)[0]
    expect(outlineSelection(data, 'edge', [edge]).contourCount).toBe(1)
    expect(() => outlineSelection(data, 'point', Object.keys(data.points))).toThrow('Select edges')
    const plan = prepareSplineOutline(scene, layer.id, 'edge', [edge], settings, 0), result = new PlanarOutlineBackend().compute(plan.request)
    expect(() => plan.command(result).command.execute({ ...scene })).toThrow('changed')
    scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${Object.keys(data.points)[0]}.x`, keyframes: [{ id: 'point-key', timeMs: 0, value: 2, easing: { type: 'linear' } }] })
    expect(() => prepareSplineOutline(scene, layer.id, 'object', ids, settings, 0)).toThrow(/keyed|timeline/i)
    scene.timelines[0].tracks.pop(); scene.layers[0].locked = true
    expect(() => prepareSplineOutline(scene, layer.id, 'object', ids, settings, 0)).toThrow(/unlock/i)
    scene.layers[0].locked = false; layer.transform.scaleX = 0
    expect(() => prepareSplineOutline(scene, layer.id, 'object', ids, settings, 0)).toThrow('invertible')
  })
})
