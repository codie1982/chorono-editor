import { describe, expect, it } from 'vitest'
import type { Layer } from '@/lib/types'
import { emptyScene, newMotionPathLayer } from '@/lib/defaults'
import { layerRegistry } from '@/lib/registry'
import { hitTestPath, moveAnchor } from '@/lib/path/pathOps'
import { resolvePathEditGeometry } from './pathEditGeometry'

/** Nested reflected/nonuniform transforms include the legacy path's custom pivot. */
function fixture() {
  const grand = layerRegistry.get('group')!.createDefault(), parent = layerRegistry.get('group')!.createDefault(), layer = newMotionPathLayer()
  grand.id = 'grand'; parent.id = 'parent'; layer.id = 'path'
  grand.transform = { x: 100, y: 50, rotationDeg: 90, scaleX: 2, scaleY: 3, anchorX: 0, anchorY: 0 }
  parent.parentId = grand.id
  parent.transform = { x: 10, y: 20, rotationDeg: 0, scaleX: -1, scaleY: 0.5, anchorX: 0, anchorY: 0 }
  layer.parentId = parent.id
  layer.transform = { x: 5, y: 7, rotationDeg: 90, scaleX: 2, scaleY: 1, anchorX: 3, anchorY: -2 }
  layer.path = { closed: false, anchors: [
    { x: 0, y: 0, inX: -10, inY: 0, outX: 10, outY: 0, pointType: 'smooth' },
    { x: 40, y: 20, pointType: 'corner' },
  ] }
  return { scene: { ...emptyScene(), layers: [grand, parent, layer] }, layer }
}

describe('legacy path editing in rendered coordinates', () => {
  it('picks real anchors and handles through nested scale, reflection, rotation and pivot', () => {
    const { scene, layer } = fixture(), before = structuredClone(scene)
    const edit = resolvePathEditGeometry(layer, scene, 0)!
    const anchor = edit.worldPath.anchors[0]
    expect(anchor.x).toBeCloseTo(41.5)
    expect(anchor.y).toBeCloseTo(58)
    expect(anchor.inX).toBeCloseTo(71.5)
    expect(anchor.inY).toBeCloseTo(58)
    expect(anchor.outX).toBeCloseTo(11.5)
    expect(anchor.outY).toBeCloseTo(58)
    expect(hitTestPath(edit.worldPath, 41.5, 58, 3)).toMatchObject({ type: 'anchor', anchorIndex: 0 })
    expect(hitTestPath(edit.worldPath, 11.5, 58, 3)).toMatchObject({ type: 'outHandle', anchorIndex: 0 })
    expect(edit.worldPath.anchors[1].x).toBeCloseTo(-78.5)
    expect(edit.worldPath.anchors[1].y).toBeCloseTo(98)
    expect(scene).toEqual(before)
  })

  it('maps a world drag to local geometry once while linked handles follow and pivot stays unchanged', () => {
    const { scene, layer } = fixture(), before = structuredClone(scene)
    const edit = resolvePathEditGeometry(layer, scene, 0)!
    const delta = edit.worldToLocal.applyToVector({ x: 12, y: 8 })
    expect(delta.x).toBeCloseTo(-4)
    expect(delta.y).toBeCloseTo(4)
    const path = moveAnchor(layer.path!, 0, delta.x, delta.y)
    const changed: Layer = { ...layer, path }
    const moved = resolvePathEditGeometry(changed, { ...scene, layers: scene.layers.map(item => item.id === layer.id ? changed : item) }, 0)!
    const a = edit.worldPath.anchors[0], b = moved.worldPath.anchors[0]
    expect(b.x - a.x).toBeCloseTo(12)
    expect(b.y - a.y).toBeCloseTo(8)
    expect(b.inX! - a.inX!).toBeCloseTo(12)
    expect(b.inY! - a.inY!).toBeCloseTo(8)
    expect(b.outX! - a.outX!).toBeCloseTo(12)
    expect(b.outY! - a.outY!).toBeCloseTo(8)
    expect(path.anchors[1]).toBe(layer.path!.anchors[1])
    expect(path.closed).toBe(false)
    expect(path.anchors[0].pointType).toBe('smooth')
    expect(changed.transform).toBe(layer.transform)
    expect(scene).toEqual(before)
  })

  it('uses displayed overrides for both the path and its parent chain', () => {
    const { scene, layer } = fixture()
    const overrides = new Map([['layers.grand.transform.y', 80], ['layers.path.transform.x', 25]])
    const edit = resolvePathEditGeometry(layer, scene, 500, overrides)!
    expect(edit.worldPath.anchors[0].x).toBeCloseTo(41.5)
    expect(edit.worldPath.anchors[0].y).toBeCloseTo(48)
    const local = edit.worldToLocal.applyToPoint(edit.worldPath.anchors[0])
    expect(local.x).toBeCloseTo(0)
    expect(local.y).toBeCloseTo(0)
    expect(layer.transform).toMatchObject({ x: 5, anchorX: 3, anchorY: -2 })
  })

  it('declines singular, hidden, locked or frozen source paths', () => {
    const { scene, layer } = fixture()
    scene.layers[0].transform.scaleX = 0
    expect(resolvePathEditGeometry(layer, scene, 0)).toBeNull()
    const restored = fixture()
    for (const flag of ['hidden', 'locked', 'frozen'] as const) {
      expect(resolvePathEditGeometry({ ...restored.layer, [flag]: true }, restored.scene, 0)).toBeNull()
    }
  })
})
