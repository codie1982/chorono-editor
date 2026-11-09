import type { ChronoScene, Transform } from '@/lib/types'
import type { MoveState, RotateState, ScaleAxisState } from '../../types/canvasDragTypes'
import type { CanvasDragPreview, CanvasPointerSample, CanvasLayerChange } from './dragTypes'
import { translateTransformTargets, rotateTransformTargets, scaleTransformTargets,
  type PreparedTransformTarget } from '@/lib/canvas/math/preparedTransforms'
import { applyAxisLock } from '@/lib/canvas/math/moveMath'
import { scaleFactorFromDelta, MIN_SCALE } from '@/lib/canvas/math/scaleMath'
import { angleDegFromPivot, wrapAngle180 } from '@/lib/canvas/math/rotateMath'
import { rotationFromPointer } from '@/lib/canvas/math/rotationGesture'
import { selectionResize } from '@/lib/canvas/math/selectionResize'
import { sourceTransformChange } from '@/lib/canvas/math/sourceTransformChange'
import type { SnapEngine } from '@/lib/snap/SnapEngine'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { readSceneGuides } from '@/lib/geometry/guides/sceneGuideData'

export interface DragWorldBounds {
  moving: PathBounds | null
  others: Array<PathBounds & { id: string }>
}
interface TransformPreviewInput {
  base: ChronoScene
  drag: MoveState | RotateState | ScaleAxisState
  event: CanvasPointerSample
  delta: { x: number; y: number }
  pointerWorld: { x: number; y: number }
  dimensions: { width: number; height: number }
  bounds: DragWorldBounds
  engine: SnapEngine | null
}

/** Apply only channels changed from the evaluated start pose. Unedited animated
 * outputs never become authored input. Explicit paths retain an edit even when
 * its final value equals the raw fallback but differs from the displayed key. */
export function transformPreview(base: ChronoScene, targets: readonly PreparedTransformTarget[],
  transforms: ReadonlyMap<string, Transform>, guides: Guide[] = [], label?: string): CanvasDragPreview {
  const changes: CanvasLayerChange[] = [], overrides = new Map<string, number>()
  for (const target of targets) {
    const transform = transforms.get(target.id)
    if (!transform) continue
    const change = sourceTransformChange(target, transform)
    if (!change) continue
    for (const path of change.changedProperties) {
      const channel = path.slice('transform.'.length) as keyof Transform
      overrides.set(`layers.${target.id}.${path}`, transform[channel])
    }
    changes.push(change)
  }
  const changed = new Map(changes.map(change => [change.next.id, change.next]))
  return { scene: changes.length ? { ...base, layers: base.layers.map(layer => changed.get(layer.id) ?? layer) } : base,
    changes, overrides, guides, label }
}

/** Resolve one world-space transform sample against immutable prepared roots.
 * Snapping uses the same evaluated union bounds for all roots. Translation is
 * deliberately not restricted to the composition rectangle: the editor's work
 * area may contain off-artboard objects while outputs remain composition-sized.
 * Parent inversion and TRS/shear validation stay in the mathematical owner. */
export function previewTransformDrag(input: TransformPreviewInput): CanvasDragPreview {
  const { base, drag, event, delta, pointerWorld, dimensions, bounds, engine } = input
  const targets = drag.targets ?? []
  if (!targets.length) throw new Error('The drag has no editable transform roots.')
  let guides: Guide[] = []
  let result: ReturnType<typeof translateTransformTargets>
  let label: string
  if (drag.kind === 'move') {
    const locked = applyAxisLock(delta.x, delta.y, drag.axisLock, event.shiftKey)
    let dx = locked.dx, dy = locked.dy
    if (bounds.moving && (dx !== 0 || dy !== 0)) {
      const rect = { ...bounds.moving, x: bounds.moving.x + dx, y: bounds.moving.y + dy }
      const snap = engine?.snapRect(rect, { canvasWidth: dimensions.width, canvasHeight: dimensions.height,
        otherLayers: bounds.others, customGuides: readSceneGuides(base).guides })
      if (snap) { dx = snap.point.x - bounds.moving.x; dy = snap.point.y - bounds.moving.y; guides = snap.guides }
      // Axis constraints survive object/grid snap as well as the raw pointer.
      if (drag.axisLock === 'x' || (event.shiftKey && locked.dy === 0)) dy = 0
      if (drag.axisLock === 'y' || (event.shiftKey && locked.dx === 0)) dx = 0
    }
    result = translateTransformTargets(targets, { x: dx, y: dy })
    label = `${drag.cloneMode ? drag.cloneMode === 'instance' ? '⧉ Instance   ' : '⧉ Copy   ' : ''}ΔX ${Math.round(dx)}   ΔY ${Math.round(dy)}`
  } else if (drag.kind === 'rotate') {
    if (targets.length === 1 && drag.gesture) {
      const single = rotationFromPointer(drag.gesture, pointerWorld, event.shiftKey)
      return transformPreview(base, targets, new Map([[targets[0].id, { ...targets[0].transform, rotationDeg: single.rotationDeg }]]), [], `${single.rotationDeg.toFixed(1)}°`)
    }
    let angle = wrapAngle180(angleDegFromPivot(drag.anchorWorldX, drag.anchorWorldY, pointerWorld.x, pointerWorld.y) - drag.startAngle)
    if (event.shiftKey) angle = Math.round(angle / 15) * 15
    result = rotateTransformTargets(targets, { x: drag.anchorWorldX, y: drag.anchorWorldY }, angle)
    label = `${angle.toFixed(1)}°  (${targets.length} layers)`
  } else if (drag.selectionResize) {
    const resize = selectionResize(drag.selectionResize.bounds, drag.selectionResize.handle, delta,
      event.shiftKey || event.ctrlKey || event.metaKey)
    if (!resize) throw new Error('The selection bounds cannot be resized. Select geometry with nonzero bounds.')
    result = scaleTransformTargets(targets, resize.pivot, resize.factorX, resize.factorY)
    label = `${(resize.factorX * 100).toFixed(0)}% × ${(resize.factorY * 100).toFixed(0)}%  (${targets.length} layers)`
  } else {
    const axis = event.shiftKey ? 'both' : drag.axis
    const factor = scaleFactorFromDelta(delta.x, delta.y, axis)
    // Preserve reflections; clamp positive factors instead of forcing a negative
    // authored scale to positive via the legacy clampScale helper.
    const fx = Math.max(MIN_SCALE, factor.factorX), fy = Math.max(MIN_SCALE, factor.factorY)
    if (targets.length === 1) {
      const transform = targets[0].transform
      return transformPreview(base, targets, new Map([[targets[0].id, { ...transform,
        scaleX: transform.scaleX * fx, scaleY: transform.scaleY * fy }]]), [], `${(fx * 100).toFixed(0)}% × ${(fy * 100).toFixed(0)}%`)
    }
    if (drag.pivotX === undefined || drag.pivotY === undefined) throw new Error('The selection scale pivot is missing.')
    result = scaleTransformTargets(targets, { x: drag.pivotX, y: drag.pivotY }, fx, fy)
    label = `${(fx * 100).toFixed(0)}% × ${(fy * 100).toFixed(0)}%  (${targets.length} layers)`
  }
  if (!result.ok) throw new Error(result.reason)
  return transformPreview(base, targets, new Map(result.changes.map(change => [change.id, change.transform])), guides, label)
}
