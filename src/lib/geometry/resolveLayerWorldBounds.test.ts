import { describe, expect, it } from 'vitest'
import type { Layer, Transform } from '@/lib/types'
import { emptyScene, newCircleLayer, newRectLayer, newSplineLayerFromData, newStarLayer } from '@/lib/defaults'
import { createPolylineSpline } from '@/lib/spline/creation/createPolylineSpline'
import { cloneSingleLayer } from '@/lib/clone/CloneSingleLayer'
import { Matrix2D } from './Matrix2D'
import { createLayerWorldBoundsResolver, resolveLayerWorldBounds } from './resolveLayerWorldBounds'

const zero: Transform = { x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }
const matrix = (t: Transform) => Matrix2D.translation(t.x + t.anchorX, t.y + t.anchorY)
  .rotate(t.rotationDeg).scale(t.scaleX, t.scaleY).translate(-t.anchorX, -t.anchorY)

describe('resolveLayerWorldBounds', () => {
  it('measures the triangle geometry at a custom pivot instead of a default inner rectangle', () => {
    const scene = emptyScene()
    const points = [{ x: -50, y: -40 }, { x: 80, y: 10 }, { x: -20, y: 70 }]
    const layer = newSplineLayerFromData(createPolylineSpline(points, true), { x: 300, y: 220 })
    Object.assign(layer.transform, { anchorX: -12, anchorY: 35, rotationDeg: 37, scaleX: 1.4, scaleY: 0.7 })
    scene.layers = [layer]
    const transformed = points.map(point => matrix(layer.transform).applyToPoint(point))
    const minX = Math.min(...transformed.map(point => point.x))
    const minY = Math.min(...transformed.map(point => point.y))
    const bounds = resolveLayerWorldBounds(layer, scene)!
    expect(bounds.x).toBeCloseTo(minX)
    expect(bounds.y).toBeCloseTo(minY)
    expect(bounds.width).toBeCloseTo(Math.max(...transformed.map(point => point.x)) - minX)
    expect(bounds.height).toBeCloseTo(Math.max(...transformed.map(point => point.y)) - minY)
    expect(layer.size).toBeUndefined()
  })

  it('uses actual cubic extrema for a converted path with a stale size field', () => {
    const scene = emptyScene()
    const layer: Layer = {
      ...newRectLayer(), type: 'path', size: { width: 1000, height: 900 },
      transform: { ...zero, x: 100, y: 200 },
      path: { closed: false, anchors: [
        { x: 20, y: 10, outX: 20, outY: 110 },
        { x: 120, y: 10, inX: 120, inY: 110 },
      ] },
    }
    scene.layers = [layer]
    expect(resolveLayerWorldBounds(layer, scene)).toEqual({ x: 120, y: 210, width: 100, height: 75 })
  })

  it.each(['spline', 'path'] as const)('resolves a raw live %s instance using its own transform', type => {
    const scene = emptyScene()
    const source: Layer = type === 'spline'
      ? newSplineLayerFromData(createPolylineSpline([{ x: -30, y: -10 }, { x: 50, y: 20 }], false))
      : { ...newRectLayer(), type: 'path', path: { closed: false, anchors: [{ x: -30, y: -10 }, { x: 50, y: 20 }] } }
    source.hidden = true // The source's visibility must not hide its instance.
    const { clonedLayer: instance } = cloneSingleLayer(source, { mode: 'instance', offsetX: 0, offsetY: 0 })
    instance.hidden = false
    instance.transform = { ...zero, x: 400, y: 300, rotationDeg: 90, scaleX: 2, scaleY: 3 }
    scene.layers = [source, instance]
    expect(instance.path).toBeUndefined()
    expect(instance.spline).toBeUndefined()
    const bounds = resolveLayerWorldBounds(instance, scene)!
    expect(bounds.x).toBeCloseTo(340)
    expect(bounds.y).toBeCloseTo(240)
    expect(bounds.width).toBeCloseTo(90)
    expect(bounds.height).toBeCloseTo(160)
    expect(resolveLayerWorldBounds(source, scene)).toBeNull()
  })

  it('unions exact transformed descendants across nested groups and ignores hidden/audio children', () => {
    const scene = emptyScene()
    const group: Layer = { ...newRectLayer(), type: 'group', size: undefined,
      transform: { ...zero, x: 100, y: 50, rotationDeg: 90, scaleX: 2, scaleY: 3 } }
    const nested: Layer = { ...newRectLayer(), type: 'group', size: undefined, parentId: group.id,
      transform: { ...zero, x: 10, y: 20 } }
    const child: Layer = { ...newRectLayer(), type: 'path', parentId: nested.id, size: { width: 1000, height: 1000 },
      transform: { ...zero }, path: { closed: true, anchors: [
        { x: -20, y: -10 }, { x: 20, y: -10 }, { x: 20, y: 10 }, { x: -20, y: 10 },
      ] } }
    const hidden: Layer = { ...newRectLayer(), parentId: group.id, hidden: true,
      transform: { ...zero, x: 900, y: 800 }, size: { width: 1000, height: 1000 } }
    const audio: Layer = { ...hidden, id: 'audio', type: 'audio', hidden: false }
    scene.layers = [group, nested, child, hidden, audio]
    const bounds = resolveLayerWorldBounds(group, scene)!
    expect(bounds.x).toBeCloseTo(10)
    expect(bounds.y).toBeCloseTo(30)
    expect(bounds.width).toBeCloseTo(60)
    expect(bounds.height).toBeCloseTo(80)
    nested.hidden = true
    expect(resolveLayerWorldBounds(group, scene)).toBeNull()
    expect(resolveLayerWorldBounds(child, scene)).toBeNull()
  })

  it('keeps a rotated circle and its parent group tightly bounded', () => {
    const scene = emptyScene()
    const group: Layer = { ...newRectLayer(), type: 'group', size: undefined,
      transform: { ...zero, x: 300, y: 200, rotationDeg: 45 } }
    const circle = newCircleLayer()
    circle.size = { width: 160, height: 160 }
    circle.parentId = group.id
    circle.transform = { ...zero, x: -80, y: -80 }
    scene.layers = [group, circle]
    const bounds = resolveLayerWorldBounds(group, scene)!
    expect(bounds.x).toBeCloseTo(220)
    expect(bounds.y).toBeCloseTo(120)
    expect(bounds.width).toBeCloseTo(160)
    expect(bounds.height).toBeCloseTo(160)
  })

  it('uses displayed parent and animated shape geometry overrides', () => {
    const scene = emptyScene()
    const star = newStarLayer()
    star.transform = { ...zero }
    star.size = { width: 120, height: 120 }
    star.shapeParams = { kind: 'star', sides: 5, outerRadius: 20, innerRadius: 10 }
    scene.layers = [star]
    const overrides = new Map([
      [`layers.${star.id}.transform.x`, 300],
      [`layers.${star.id}.shapeParams.outerRadius`, 80],
    ])
    const bounds = resolveLayerWorldBounds(star, scene, 500, overrides)!
    expect(bounds.x).toBeCloseTo(360 - 80 * Math.cos(Math.PI / 10))
    expect(bounds.y).toBeCloseTo(-20)
    expect(bounds.width).toBeCloseTo(160 * Math.cos(Math.PI / 10))
    expect(bounds.height).toBeCloseTo(80 + 80 * Math.sin(3 * Math.PI / 10))
  })

  it('uses the animated rounded-rectangle corner radius before calculating rotated extents', () => {
    const scene = emptyScene()
    const rect = newRectLayer()
    rect.transform = { ...zero, rotationDeg: 45 }
    rect.size = { width: 100, height: 60 }
    scene.layers = [rect]
    const bounds = resolveLayerWorldBounds(rect, scene, 500,
      new Map([[`layers.${rect.id}.style.cornerRadius`, 20]]))!
    expect(bounds.width).toBeCloseTo(2 * (40 / Math.sqrt(2) + 20), 6)
    expect(bounds.height).toBeCloseTo(bounds.width, 6)
  })

  it('returns null for empty, unsupported, hidden and cyclic content', () => {
    const scene = emptyScene()
    const group: Layer = { ...newRectLayer(), type: 'group', size: undefined, transform: { ...zero } }
    const other: Layer = { ...group, id: 'other', parentId: group.id }
    scene.layers = [group]
    expect(resolveLayerWorldBounds(group, scene)).toBeNull()
    group.parentId = other.id
    scene.layers = [group, other]
    expect(resolveLayerWorldBounds(group, scene)).toBeNull()
    expect(resolveLayerWorldBounds(other, scene)).toBeNull()
    const missing: Layer = { ...newRectLayer(), instanceOf: 'missing' }
    expect(resolveLayerWorldBounds(missing, scene)).toBeNull()
    const unsupported: Layer = { ...newRectLayer(), type: 'particleEmitter' }
    expect(resolveLayerWorldBounds(unsupported, scene)).toBeNull()
    const hidden = { ...newRectLayer(), hidden: true }
    expect(resolveLayerWorldBounds(hidden, scene)).toBeNull()
  })

  it('transforms the stored media box and honors text alignment', () => {
    const scene = emptyScene()
    const image: Layer = { ...newRectLayer(), type: 'image', size: { width: 200, height: 80 },
      transform: { ...zero, x: 100, y: 200, scaleX: -2, scaleY: 3 } }
    const text: Layer = { ...image, id: 'text', type: 'text', transform: { ...zero },
      text: { value: 'Text', fontSize: 20, color: '#fff', textAlign: 'center' } }
    scene.layers = [image, text]
    expect(resolveLayerWorldBounds(image, scene)).toEqual({ x: -300, y: 200, width: 400, height: 240 })
    expect(resolveLayerWorldBounds(text, scene)).toEqual({ x: -100, y: 0, width: 200, height: 80 })
  })

  it('shares one frame across bulk queries and creates a fresh cache for the next scene', () => {
    const scene = emptyScene()
    const shape = newCircleLayer()
    shape.transform = { ...zero, x: 100, y: 200 }
    scene.layers = [shape]
    const resolve = createLayerWorldBoundsResolver(scene, 500,
      new Map([[`layers.${shape.id}.transform.x`, 300]]))
    const first = resolve(shape)!
    expect(first).toEqual({ x: 300, y: 200, width: 60, height: 60 })
    expect(resolve(shape)).toBe(first)

    const moved = { ...shape, transform: { ...shape.transform, x: 500 } }
    const nextScene = { ...scene, layers: [moved] }
    expect(createLayerWorldBoundsResolver(nextScene)(moved)).toEqual({ x: 500, y: 200, width: 60, height: 60 })
    expect(first.x).toBe(300)
  })

  it('uses animated spline points and pivots for the DOM selection bounds inside a parent', () => {
    const scene = emptyScene()
    const parent: Layer = { ...newRectLayer(), type: 'group', transform: { ...zero, x: 30, y: 40 } }
    const spline = newSplineLayerFromData(createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false))
    const pointId = Object.keys(spline.spline!.points)[1]
    spline.parentId = parent.id
    spline.transform = { ...zero, x: 100, y: 200, rotationDeg: 90, scaleX: 2, anchorX: 10 }
    scene.layers = [parent, spline]
    const bounds = resolveLayerWorldBounds(spline, scene, 500, new Map([
      [`layers.${spline.id}.spline.points.${pointId}.x`, 200],
      [`layers.${spline.id}.transform.anchorX`, 20],
    ]))!
    expect(bounds.x).toBeCloseTo(150)
    expect(bounds.y).toBeCloseTo(200)
    expect(bounds.width).toBeCloseTo(0)
    expect(bounds.height).toBeCloseTo(400)
    expect(spline.spline!.points[pointId].x).toBe(100)
    expect(spline.transform.anchorX).toBe(10)
  })

  it('measures animated Bezier handles and keeps instance geometry tracks independent', () => {
    const scene = emptyScene()
    const path: Layer = { ...newRectLayer(), type: 'path', transform: { ...zero, x: 10, y: 20 },
      path: { closed: false, anchors: [
        { x: 0, y: 0, outX: 0, outY: 100 }, { x: 100, y: 0, inX: 100, inY: 100 },
      ] } }
    const { clonedLayer: instance } = cloneSingleLayer(path, { mode: 'instance', offsetX: 500, offsetY: 0 })
    scene.layers = [path, instance]
    const frame = new Map([
      [`layers.${path.id}.path.anchors.0.outY`, 200],
      [`layers.${path.id}.path.anchors.1.inY`, 200],
      [`layers.${instance.id}.path.anchors.1.x`, 200],
      [`layers.${instance.id}.path.anchors.1.inX`, 200],
    ])
    expect(resolveLayerWorldBounds(path, scene, 500, frame)).toEqual({ x: 10, y: 20, width: 100, height: 150 })
    expect(resolveLayerWorldBounds(instance, scene, 500, frame)).toEqual({ x: 510, y: 20, width: 200, height: 75 })
    expect(path.path!.anchors[0].outY).toBe(100)
  })
})
