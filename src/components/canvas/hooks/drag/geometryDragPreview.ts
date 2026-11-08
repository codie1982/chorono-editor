import type { ChronoScene, Layer, Transform } from '@/lib/types'
import type { ActiveDrag } from '../../types/canvasDragTypes'
import type { CanvasDragPreview, CanvasPointerSample } from './dragTypes'
import { moveAnchor, moveInHandle, moveOutHandle } from '@/lib/path/pathOps'
import { moveSplinePoint, moveSplineHandle } from '@/lib/spline'
import { calculateAnchorMove } from '@/lib/canvas/math/anchorMath'
import { calculateResize } from '@/lib/canvas/math/resizeMath'
import { Matrix2D } from '@/lib/geometry/Matrix2D'

type GeometryDrag = Exclude<ActiveDrag, { kind: 'move' | 'rotate' | 'scaleAxis' }>
interface GeometryPreviewInput {
  base: ChronoScene
  drag: GeometryDrag
  event: CanvasPointerSample
  delta: { x: number; y: number }
  snap: { grid: boolean; pixel: boolean; size: number }
}

/** Pure path/spline/anchor/size preview from the gesture's immutable baseline.
 * Geometry deltas use the complete displayed inverse; path points keep their
 * existing topology and custom pivot. No per-frame geometry is accumulated. */
export function previewGeometryDrag({ base, drag, event, delta, snap }: GeometryPreviewInput): CanvasDragPreview {
  const original = drag.originalLayer
  if (drag.kind === 'pathPoint') {
    const anchor = original.path?.anchors[drag.anchorIndex]
    if (!anchor || !original.path) return previewLayer(base, original, original, [])
    const local = drag.worldToLocal.applyToVector(delta)
    const path = drag.part === 'anchor'
      ? moveAnchor(original.path, drag.anchorIndex, local.x, local.y)
      : drag.part === 'inHandle'
        ? moveInHandle(original.path, drag.anchorIndex, (anchor.inX ?? anchor.x) + local.x, (anchor.inY ?? anchor.y) + local.y)
        : moveOutHandle(original.path, drag.anchorIndex, (anchor.outX ?? anchor.x) + local.x, (anchor.outY ?? anchor.y) + local.y)
    return previewLayer(base, original, { ...original, path }, changedRecord(original.path, path) ? ['path'] : [])
  }
  if (drag.kind === 'splinePoint' || drag.kind === 'splineHandle') {
    if (!original.spline) return previewLayer(base, original, original, [])
    const local = drag.worldToLocal.applyToVector(delta)
    const spline = drag.kind === 'splinePoint'
      ? moveSplinePoint(original.spline, drag.pointId, drag.startX + local.x, drag.startY + local.y)
      : moveSplineHandle(original.spline, drag.pointId, drag.handleKind, drag.startX + local.x, drag.startY + local.y)
    return previewLayer(base, original, { ...original, spline }, changedRecord(original.spline, spline) ? ['spline'] : [])
  }
  if (drag.kind === 'newAnchorDraw') {
    const provisional = base.layers.find(layer => layer.id === drag.layerId)
    if (!provisional?.path) return previewLayer(base, original, original, [])
    const local = drag.worldToLocal?.applyToVector(delta) ?? delta
    const smooth = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 5
    const point = { ...provisional.path.anchors[drag.anchorIndex], x: drag.anchorX, y: drag.anchorY,
      ...(smooth ? { outX: drag.anchorX + local.x, outY: drag.anchorY + local.y,
        inX: drag.anchorX - local.x, inY: drag.anchorY - local.y, pointType: 'smooth' as const }
        : { pointType: 'corner' as const }) }
    const path = { ...provisional.path, anchors: provisional.path.anchors.map((anchor, index) => index === drag.anchorIndex ? point : anchor) }
    // Preserve the custom pivot. Geometry insertion must not implicitly move
    // the anchor on rotated/scaled or animated layers.
    return previewLayer(base, original, { ...original, path }, ['path'], smooth ? `Smooth · ${Math.round(Math.hypot(local.x, local.y))}px` : 'Corner')
  }
  if (drag.kind === 'anchor') {
    const result = calculateAnchorMove({ ...drag.displayTransform, dx: delta.x, dy: delta.y,
      parentWorld: drag.parentWorld, snapGrid: snap.grid, snapPixel: snap.pixel, gridSize: snap.size })
    return previewTransform(base, original, drag.displayTransform, { ...drag.displayTransform, ...result },
      `Anchor  ${Math.round(result.anchorX)}, ${Math.round(result.anchorY)}`)
  }

  if (!original.size) return previewLayer(base, original, original, [])
  const displayed = drag.displayTransform ?? original.transform
  const local = drag.worldToLocal?.applyToVector(delta) ?? delta
  const size = calculateResize({ x: 0, y: 0, width: original.size.width, height: original.size.height,
    anchorX: displayed.anchorX, anchorY: displayed.anchorY, handle: drag.handle, dx: local.x, dy: local.y,
    proportional: event.metaKey || event.ctrlKey, snapPixel: snap.pixel, minSize: 4,
    boundsWidth: Number.MAX_SAFE_INTEGER, boundsHeight: Number.MAX_SAFE_INTEGER })
  const left = drag.handle.includes('w') ? original.size.width - size.width : 0
  const top = drag.handle.includes('n') ? original.size.height - size.height : 0
  // The custom pivot is authored independently of geometry size. Keep a fixed:
  // M = T(x+a) R S T(-a); preserving the opposite corner requires only R·S
  // times its local size shift. Proportional reanchoring would change the
  // transform at every other key time even though only this pose was edited.
  const shift = Matrix2D.rotation(displayed.rotationDeg).scale(displayed.scaleX, displayed.scaleY).applyToVector({ x: left, y: top })
  const preview = previewTransform(base, original, displayed, { ...displayed, x: displayed.x + shift.x, y: displayed.y + shift.y },
    `W ${Math.round(size.width)}   H ${Math.round(size.height)}`)
  const next = preview.changes[0]?.next ?? original
  const properties = [...(preview.changes[0]?.changedProperties ?? [])]
  if (size.width !== original.size.width) properties.push('size.width')
  if (size.height !== original.size.height) properties.push('size.height')
  return previewLayer(base, original, { ...next, size: { ...original.size, width: size.width, height: size.height } }, properties, preview.label, preview.overrides)
}

/** Select only changed displayed channels, leaving authored fallback values on
 * all other channels untouched. Anchor edits use the native non-keyed fields. */
function previewTransform(base: ChronoScene, original: Layer, before: Transform, after: Transform, label: string): CanvasDragPreview {
  const next = { ...original, transform: { ...original.transform } }, overrides = new Map<string, number>(), properties: string[] = []
  for (const key of ['x', 'y', 'anchorX', 'anchorY'] as const) {
    if (Math.abs(after[key] - before[key]) <= 1e-8) continue
    next.transform[key] = after[key]
    properties.push(`transform.${key}`)
    overrides.set(`layers.${original.id}.transform.${key}`, after[key])
  }
  return previewLayer(base, original, next, properties, label, overrides)
}

/** Keep source replacement and the explicit edited-path list in one preview. */
function previewLayer(base: ChronoScene, prev: Layer, next: Layer, properties: readonly string[], label?: string,
  overrides = new Map<string, number>()): CanvasDragPreview {
  return { scene: properties.length ? { ...base, layers: base.layers.map(layer => layer.id === next.id ? next : layer) } : base,
    changes: properties.length ? [{ prev, next, changedProperties: properties }] : [], overrides, guides: [], label }
}

/** Geometry records are bounded source JSON; compare content to avoid no-op undo. */
function changedRecord(before: unknown, after: unknown): boolean { return JSON.stringify(before) !== JSON.stringify(after) }
