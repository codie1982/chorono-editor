import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { beginRotationGesture } from '@/lib/canvas/math/rotationGesture'
import { SnapEngine, type SnapEngineSettings } from '@/lib/snap/SnapEngine'
import type { RotateState, ScaleAxisState } from '../../types/canvasDragTypes'
import { previewTransformDrag } from './transformDragPreview'

const event = { pointerId: 1, clientX: 0, clientY: 0, shiftKey: false, ctrlKey: false, metaKey: false }
const settings: SnapEngineSettings = { enabled: false, radiusPx: 12,
  targets: { objects: false, points: false, guides: false, grid: false, pixel: false, vertex: false, segment: false },
  grid: { sizePx: 20, visible: true }, angle: { enabled: true, stepDeg: 45 }, scale: { enabled: true, stepPercent: 10 } }
const a = { ...newRectLayer(), id: 'a', transform: { x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 7, scaleX: -0.8, scaleY: 1 } }
const base = { ...emptyScene(), layers: [a, { ...a, id: 'b', transform: { ...a.transform, x: 100 } }] }
const prepare = (ids: string[]) => {
  const result = prepareTransformTargets(base, ids, 0)
  if (!result.ok) throw new Error(result.reason)
  return result
}
/** Use the real transform adapter and immutable targets; pointer units are world px. */
function preview(drag: RotateState | ScaleAxisState, x: number, y: number, cfg = settings) {
  return previewTransformDrag({ base, drag, event, pointerWorld: { x, y }, delta: { x, y }, engine: new SnapEngine(cfg),
    dimensions: { width: 1000, height: 1000 }, bounds: { moving: null, others: [] } })
}
describe('viewport transform snapping with Move disabled', () => {
  it('quantizes single local rotation from the evaluated starting angle', () => {
    const targets = prepare(['a']).targets, gesture = beginRotationGesture(a, base, 0, { x: 100, y: 0 })!
    const drag: RotateState = { kind: 'rotate', originalRotation: 7, layerId: a.id, originalLayer: a, targets, gesture,
      startClientX: 0, startClientY: 0, startAngle: 0, anchorWorldX: 0, anchorWorldY: 0 }
    const x = 100 * Math.cos(40 * Math.PI / 180), y = 100 * Math.sin(40 * Math.PI / 180)
    expect(preview(drag, x, y).scene.layers[0].transform.rotationDeg).toBe(45)
    expect(preview(drag, x, y, { ...settings, angle: { ...settings.angle, enabled: false } }).scene.layers[0].transform.rotationDeg).toBeCloseTo(47)
    expect(base.layers[0].transform.rotationDeg).toBe(7)
  })
  it('quantizes a multi-root world rotation delta without changing key data', () => {
    const prepared = prepare(['a', 'b'])
    const drag: RotateState = { kind: 'rotate', originalRotation: 7, layerId: a.id, originalLayer: a, targets: prepared.targets,
      startClientX: 0, startClientY: 0, startAngle: 0, anchorWorldX: 50, anchorWorldY: 0 }
    const result = preview(drag, 50 + 100 * Math.cos(40 * Math.PI / 180), 100 * Math.sin(40 * Math.PI / 180))
    result.changes.forEach(change => expect(change.next.transform.rotationDeg).toBeCloseTo(52))
    expect(result.scene.timelines).toBe(base.timelines)
  })
  it('scales relative to the original reflected value and leaves the inactive axis alone', () => {
    const drag: ScaleAxisState = { kind: 'scaleAxis', axis: 'x', layerId: a.id, originalLayer: a, targets: prepare(['a']).targets, startClientX: 0, startClientY: 0 }
    const result = preview(drag, 16, 900)
    expect(result.scene.layers[0].transform.scaleX).toBeCloseTo(-0.96)
    expect(result.scene.layers[0].transform.scaleY).toBe(1)
    expect(preview(drag, 16, 900, { ...settings, scale: { enabled: false, stepPercent: 10 } }).scene.layers[0].transform.scaleX).toBeCloseTo(-0.928)
  })
  it('snaps common selection handles around the fixed opposite edge and retains child/source data', () => {
    const plain = { ...base, layers: base.layers.map(layer => ({ ...layer, transform: { ...layer.transform, rotationDeg: 0 } })) }
    const prepared = prepareTransformTargets(plain, ['a', 'b'], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    const drag: ScaleAxisState = { kind: 'scaleAxis', axis: 'both', layerId: a.id, originalLayer: plain.layers[0], targets: prepared.targets,
      startClientX: 0, startClientY: 0, selectionResize: { bounds: { x: 0, y: 0, width: 200, height: 100 }, handle: 'e' } }
    const result = previewTransformDrag({ base: plain, drag, event, delta: { x: 32, y: 80 }, pointerWorld: { x: 232, y: 130 },
      dimensions: { width: 1000, height: 1000 }, bounds: { moving: null, others: [] }, engine: new SnapEngine(settings) })
    expect(result.scene.layers[0].transform.scaleX).toBeCloseTo(-0.96)
    expect(result.scene.layers[1].transform.x).toBeCloseTo(120)
    result.scene.layers.forEach((layer, i) => { expect(layer.transform.y).toBe(plain.layers[i].transform.y); expect(layer.transform.scaleY).toBe(1) })
    expect(result.guides).toEqual([]); expect(result.snapPoint).toBeUndefined()
  })
})
