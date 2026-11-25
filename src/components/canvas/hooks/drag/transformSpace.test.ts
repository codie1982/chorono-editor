import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { transformAxisFrame } from '@/lib/canvas/math/transformAxes'
import { previewTransformDrag } from './transformDragPreview'
import { SnapEngine } from '@/lib/snap/SnapEngine'
import type { MoveState } from '../../types/canvasDragTypes'

describe('viewport transform reference frame', () => {
  it.each(['scene', 'local'] as const)('keeps %s X locked through object snapping and clone axis snapping', space => {
    const layer = newRectLayer(); layer.transform = { ...layer.transform, rotationDeg: 38 }
    const base = { ...emptyScene(), layers: [layer] }, prepared = prepareTransformTargets(base, [layer.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    const frame = transformAxisFrame(space, prepared.activeTarget.worldMatrix)
    const drag: MoveState = { kind: 'move', layerId: layer.id, originalLayer: layer, targets: prepared.targets,
      movingLayers: [], width: 80, height: 80, startClientX: 0, startClientY: 0, axisLock: 'x', axisFrame: frame, cloneMode: 'copy' }
    const preview = previewTransformDrag({ base, drag,
      event: { pointerId: 1, clientX: 40, clientY: 12, shiftKey: true, metaKey: true, ctrlKey: false },
      delta: frame.applyToVector({ x: 40, y: 12 }), pointerWorld: { x: 40, y: 12 },
      engine: new SnapEngine({ enabled: true, radiusPx: 10, targets: { grid: true, objects: true, points: false, guides: false, pixel: false, vertex: false, segment: false }, grid: { sizePx: 20 }, angle: { enabled: false, stepDeg: 15 }, scale: { enabled: false, stepPercent: 10 } }),
      dimensions: { width: 800, height: 600 }, bounds: { moving: { x: 33, y: 31, width: 80, height: 80 }, others: [] } })
    const next = preview.scene.layers[0].transform
    const inFrame = frame.invert().applyToVector({ x: next.x - layer.transform.x, y: next.y - layer.transform.y })
    expect(inFrame.x).toBeGreaterThan(0); expect(inFrame.y).toBeCloseTo(0)
    expect(next.rotationDeg).toBe(layer.transform.rotationDeg)
    expect(preview.scene.timelines).toBe(base.timelines)
  })
})
