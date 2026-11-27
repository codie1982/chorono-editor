import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { previewGeometryDrag } from './geometryDragPreview'
import { selectionResize, type SelectionResizeHandle } from '@/lib/canvas/math/selectionResize'

describe('resize modifier invariants', () => {
  it.each(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as SelectionResizeHandle[])(
    'preserves aspect and world center through Cmd+Shift %s, including rotation and pixel snapping', handle => {
      const original = { ...newRectLayer(), size: { width: 103, height: 57 },
        transform: { x: 200, y: 150, scaleX: -1.5, scaleY: 2, rotationDeg: 35, anchorX: 17, anchorY: 9 } }
      const base = { ...emptyScene(), layers: [original] }
      const matrix = resolveLayerWorldMatrix(original, base)
      const localDelta = { x: handle.includes('w') ? -13.3 : 13.3, y: handle.includes('n') ? -7.7 : 7.7 }
      const result = previewGeometryDrag({ base, drag: { kind: 'resize', layerId: original.id, originalLayer: original,
        handle, startClientX: 0, startClientY: 0, worldToLocal: matrix.invert(), displayTransform: original.transform },
        event: { pointerId: 1, clientX: 10, clientY: 10, metaKey: true, ctrlKey: false, shiftKey: true },
        delta: matrix.applyToVector(localDelta), snap: { grid: false, pixel: true, size: 10 } })
      const next = result.scene.layers[0]
      expect(next.size!.width / next.size!.height).toBeCloseTo(103 / 57)
      const before = matrix.applyToPoint({ x: 103 / 2, y: 57 / 2 })
      const after = resolveLayerWorldMatrix(next, result.scene).applyToPoint({ x: next.size!.width / 2, y: next.size!.height / 2 })
      expect(after.x).toBeCloseTo(before.x)
      expect(after.y).toBeCloseTo(before.y)
      expect(next.transform.anchorX).toBe(17)
      expect(next.transform.anchorY).toBe(9)
    })

  it('Cmd alone pins the opposite corner; minimum size keeps a non-square aspect', () => {
    const original = { ...newRectLayer(), size: { width: 100, height: 50 } }
    const base = { ...emptyScene(), layers: [original] }
    const result = previewGeometryDrag({ base, drag: { kind: 'resize', layerId: original.id, originalLayer: original,
      handle: 'se', startClientX: 0, startClientY: 0, worldToLocal: Matrix2D.identity() },
      event: { pointerId: 1, clientX: 10, clientY: 10, metaKey: true, ctrlKey: false, shiftKey: false },
      delta: { x: -1000, y: -1000 }, snap: { grid: false, pixel: true, size: 10 } })
    expect(result.scene.layers[0].size).toEqual({ width: 8, height: 4 })
    expect(result.scene.layers[0].transform).toEqual(original.transform)
  })

  it('centered selection math uses half extents for growth and shrink', () => {
    const bounds = { x: 20, y: 30, width: 100, height: 50 }
    expect(selectionResize(bounds, 'se', { x: 25, y: 0 }, true, true))
      .toEqual({ pivot: { x: 70, y: 55 }, factorX: 1.5, factorY: 1.5 })
    expect(selectionResize(bounds, 'nw', { x: 25, y: 0 }, true, true))
      .toEqual({ pivot: { x: 70, y: 55 }, factorX: 0.5, factorY: 0.5 })
  })
})
