import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { SnapEngine, type SnapEngineSettings } from '@/lib/snap/SnapEngine'
import { previewGeometryDrag } from './geometryDragPreview'
import type { ResizeHandle } from '@/lib/canvas/math/resizeMath'

const settings: SnapEngineSettings = { enabled: true, radiusPx: 12, targets: { grid: true, objects: false, parent: false, points: false, guides: false, pixel: false, vertex: false, segment: false }, grid: { sizePx: 40 }, angle: { enabled: false, stepDeg: 15 }, scale: { enabled: false, stepPercent: 5 } }
const event = { pointerId: 1, clientX: 0, clientY: 0, shiftKey: false, ctrlKey: false, metaKey: false }
function fixture() {
  const layer = { ...newRectLayer(), size: { width: 80, height: 60 } }
  layer.transform = { x: 450, y: 280, anchorX: 40, anchorY: 30, rotationDeg: 0, scaleX: 1, scaleY: 1 }
  const base = { ...emptyScene(), layers: [layer] }, engine = new SnapEngine(settings)
  const context = { canvasWidth: 1000, canvasHeight: 1000, otherLayers: [], zoom: 1 }
  const preview = (handle: ResizeHandle, delta: { x: number; y: number }, modifiers = {}) => previewGeometryDrag({ base,
    drag: { kind: 'resize', layerId: layer.id, originalLayer: layer, handle, startClientX: 0, startClientY: 0,
      worldToLocal: resolveLayerWorldMatrix(layer, base).invert(), displayTransform: layer.transform }, event: { ...event, ...modifiers }, delta,
    snap: { grid: true, pixel: false, size: 40 }, resolveSnap: point => engine.resolvePoint(point, context), snapRadiusWorld: engine.radiusWorld(1) })
  return { layer, base, engine, preview }
}

describe('geometry handle snap', () => {
  it('snaps the moving corner, pins its opposite and preserves custom anchor/source', () => {
    const { preview, base } = fixture(), before = JSON.stringify(base), result = preview('se', { x: 27, y: 18 })
    expect(result.scene.layers[0].size).toEqual({ width: 110, height: 80 })
    expect(result.scene.layers[0].transform).toEqual(base.layers[0].transform)
    expect(result.snapPoint).toEqual({ x: 560, y: 360 }); expect(result.guides).toHaveLength(2)
    expect(JSON.stringify(base)).toBe(before)
  })
  it('snaps side handles only along their permitted axis and moves west/north while pinning the other edge', () => {
    const h = fixture(), east = h.preview('e', { x: 27, y: 35 })
    expect(east.scene.layers[0].size).toEqual({ width: 110, height: 60 })
    expect(east.snapPoint).toEqual({ x: 560, y: 310 }); expect(east.guides.map(g => g.axis)).toEqual(['v'])
    const northwest = h.preview('nw', { x: -13, y: -43 }).scene.layers[0]
    expect(northwest.transform.x).toBe(440); expect(northwest.transform.y).toBe(240)
    expect(northwest.size).toEqual({ width: 90, height: 100 })
  })
  it('keeps aspect constraints and reports only the reached grid axis', () => {
    const result = fixture().preview('se', { x: 27, y: 20 }, { metaKey: true }), layer = result.scene.layers[0]
    expect(layer.size!.width / layer.size!.height).toBeCloseTo(4 / 3)
    expect(result.snapPoint!.y).toBeCloseTo(360); expect(result.guides.map(g => g.axis)).toEqual(['h'])
  })
  it('resolves a rotated nonuniform parent in world pixels without modifying parent or inactive dimension', () => {
    const { layer, engine } = fixture(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    parent.transform = { x: 100, y: 50, anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 2, scaleY: 3 }
    layer.parentId = parent.id; layer.transform = { ...layer.transform, x: 0, y: 0, anchorX: 0, anchorY: 0 }
    const base = { ...emptyScene(), layers: [parent, layer] }
    const result = previewGeometryDrag({ base, drag: { kind: 'resize', layerId: layer.id, originalLayer: layer, handle: 'e',
      startClientX: 0, startClientY: 0, worldToLocal: resolveLayerWorldMatrix(layer, base).invert(), displayTransform: layer.transform },
      event, delta: { x: 5, y: 25 }, snap: { grid: true, pixel: false, size: 40 }, snapRadiusWorld: 12,
      resolveSnap: point => engine.resolvePoint(point, { canvasWidth: 1000, canvasHeight: 1000, otherLayers: [] }) })
    expect(result.scene.layers[1].size!.width).toBeCloseTo(95); expect(result.scene.layers[1].size!.height).toBe(60)
    expect(result.snapPoint!.x).toBeCloseTo(10); expect(result.snapPoint!.y).toBeCloseTo(240)
    expect(result.scene.layers[0]).toBe(parent)
  })
})
