import { describe, expect, it } from 'vitest'
import { SnapEngine, type SnapEngineSettings } from './SnapEngine'
import { prepareSceneSnapContext } from './prepareSceneSnapContext'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '../defaults'
import { createPolylineSpline } from '../spline'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'

const settings: SnapEngineSettings = { enabled: true, radiusPx: 12,
  targets: { grid: true, objects: false, points: false, guides: false, pixel: true, vertex: true, segment: false },
  grid: { sizePx: 20, visible: true }, angle: { enabled: false, stepDeg: 15 }, scale: { enabled: false, stepPercent: 10 } }
const context = { canvasWidth: 500, canvasHeight: 500, otherLayers: [], splineVertices: [
  { layerId: 'a', pointId: 'p', x: 23.25, y: 34.5, openEndpoint: true },
  { layerId: 'b', pointId: 'q', x: 25.25, y: 34.5, openEndpoint: false }] }

describe('exact spline vertex acquisition', () => {
  it('uses radial screen tolerance, preserves identity and beats grid/pixel without mixing axes', () => {
    const engine = new SnapEngine(settings)
    const hit = engine.resolvePoint({ x: 22, y: 35 }, { ...context, zoom: 2 })
    expect(hit.point).toEqual({ x: 23.25, y: 34.5 }); expect(hit.candidate?.vertex?.pointId).toBe('p')
    expect(engine.resolvePoint({ x: 32, y: 43 }, { ...context, zoom: 2 }).candidate).toBeUndefined()
    expect(engine.resolvePoint({ x: 24.25, y: 34.5 }, context).candidate?.vertex?.pointId).toBe('p')
    expect(engine.resolvePoint({ x: 40, y: 35 }, { ...context, zoom: .5 }).candidate?.vertex?.pointId).toBe('q')
    engine.setSettings({ ...settings, targets: { ...settings.targets, vertex: false } })
    expect(engine.resolvePoint({ x: 22, y: 35 }, context).candidate).toBeUndefined()
    engine.setSettings({ ...settings, enabled: false })
    expect(engine.resolvePoint({ x: 22, y: 35 }, context).point).toEqual({ x: 22, y: 35 })
  })
  it('evaluates parent and keyed point coordinates, filters hidden/scope/moving layers and marks only open ends', () => {
    const scene = emptyScene(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    parent.transform = { ...parent.transform, x: 70, y: 90, scaleX: 2, scaleY: .5, rotationDeg: 30 }
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: 10 }, { x: 40, y: 0 }], false)
    const layer = newSplineLayerFromData(data, { x: 15, y: 20 }); layer.parentId = parent.id
    const points = Object.values(data.points); points[2].locked = true
    scene.layers = [parent, layer]
    scene.timelines = [{ id: 'main', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: `layers.${layer.id}.spline.points.${points[0].id}.x`, keyframes: [{ id: 'point-key', timeMs: 0, value: 8, easing: { type: 'linear' } }] }] }]
    const source = structuredClone(scene), result = prepareSceneSnapContext(scene, 0, undefined, [], undefined, true).splineVertices!
    const expected = resolveLayerWorldMatrix(layer, scene, 0).applyToPoint({ x: 8, y: 0 })
    expect(result[0].x).toBeCloseTo(expected.x); expect(result[0].y).toBeCloseTo(expected.y)
    expect(result.map(point => point.openEndpoint)).toEqual([true, false, false])
    expect(prepareSceneSnapContext(scene, 0, undefined, [parent.id], undefined, true).splineVertices).toEqual([])
    expect(prepareSceneSnapContext(scene, 0, undefined, [], new Set(), true).splineVertices).toEqual([])
    expect(scene).toEqual(source); parent.hidden = true
    expect(prepareSceneSnapContext(scene, 0, undefined, [], undefined, true).splineVertices).toEqual([])
  })
})
