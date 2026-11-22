import type { ChronoScene, Transform } from '@/lib/types'
import type { MoveState, RotateState, ScaleAxisState } from '../../types/canvasDragTypes'
import type { CanvasDragPreview, CanvasPointerSample, CanvasLayerChange } from './dragTypes'
import { translateTransformTargets, rotateTransformTargets, scaleTransformTargets,
  type PreparedTransformTarget } from '@/lib/canvas/math/preparedTransforms'
import { constrainAxisDelta } from '@/lib/canvas/math/transformAxes'
import { scaleFactorFromDelta, MIN_SCALE } from '@/lib/canvas/math/scaleMath'
import { angleDegFromPivot, wrapAngle180 } from '@/lib/canvas/math/rotateMath'
import { rotationFromPointer } from '@/lib/canvas/math/rotationGesture'
import { selectionResize, MIN_SELECTION_RESIZE_EXTENT } from '@/lib/canvas/math/selectionResize'
import { sourceTransformChange } from '@/lib/canvas/math/sourceTransformChange'
import type { SnapEngine } from '@/lib/snap/SnapEngine'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { readSceneGuides } from '@/lib/geometry/guides/sceneGuideData'
import { resizeHandlePoint, snapResizeHandle, reachedResizeGuides } from '@/lib/canvas/math/resizeSnapping'

export interface DragWorldBounds {
  moving: PathBounds | null
  others: Array<PathBounds & { id: string }>
  parents?: readonly PathBounds[]
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
  zoom?: number
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
  let snapPoint: { x: number; y: number } | undefined
  let result: ReturnType<typeof translateTransformTargets>
  let label: string
  if (drag.kind === 'move') {
    const locked = constrainAxisDelta(delta, drag.axisLock, event.shiftKey, drag.axisFrame)
    let dx = locked.dx, dy = locked.dy
    if (bounds.moving && (dx !== 0 || dy !== 0)) {
      const rect = { ...bounds.moving, x: bounds.moving.x + dx, y: bounds.moving.y + dy }
      const snap = engine?.snapRect(rect, { canvasWidth: dimensions.width, canvasHeight: dimensions.height,
        otherLayers: bounds.others, parentBounds: bounds.parents, zoom: input.zoom,
        customGuides: readSceneGuides(base).guides })
      if (snap) { dx = snap.point.x - bounds.moving.x; dy = snap.point.y - bounds.moving.y; guides = snap.guides
        if (guides.length) snapPoint = { x: guides.find(g => g.axis === 'v')?.position ?? snap.point.x, y: guides.find(g => g.axis === 'h')?.position ?? snap.point.y } }
      // Axis constraints survive object/grid snap as well as the raw pointer.
      const constrained = constrainAxisDelta({ x: dx, y: dy }, locked.axis, false, drag.axisFrame)
      dx = constrained.dx; dy = constrained.dy
    }
    // Command/Ctrl-drag copy gestures use the same snap engine to keep the
    // duplicate on the horizontal or vertical axis without requiring Shift.
    // This also applies when the moving bounds are unavailable (for example
    // an empty/off-artboard geometry proxy).
    if (drag.cloneMode && engine) {
      const coordinates = drag.axisFrame?.invert().applyToVector({ x: dx, y: dy }) ?? { x: dx, y: dy }
      const axisSnapped = engine.snapTranslationAxis(coordinates, input.zoom)
      const world = drag.axisFrame?.applyToVector(axisSnapped) ?? axisSnapped
      const constrained = constrainAxisDelta(world, locked.axis, false, drag.axisFrame)
      dx = constrained.dx; dy = constrained.dy
    }
    // Show only guides actually reached after the axis constraint. A snap in
    // screen axes must never pull a Local drag away from its selected axis.
    if (bounds.moving) {
      const rect = bounds.moving
      guides = guides.filter(guide => (guide.axis === 'v'
        ? [rect.x + dx, rect.x + dx + rect.width / 2, rect.x + dx + rect.width]
        : [rect.y + dy, rect.y + dy + rect.height / 2, rect.y + dy + rect.height])
        .some(value => Math.abs(value - guide.position) < 1e-5))
      if (!guides.length) snapPoint = undefined
    }
    result = translateTransformTargets(targets, { x: dx, y: dy })
    label = `${drag.cloneMode ? drag.cloneMode === 'instance' ? '⧉ Instance   ' : '⧉ Copy   ' : ''}ΔX ${Math.round(dx)}   ΔY ${Math.round(dy)}`
  } else if (drag.kind === 'rotate') {
    if (targets.length === 1 && drag.gesture) {
      const single = rotationFromPointer(drag.gesture, pointerWorld, event.shiftKey && !engine?.angleSnappingEnabled)
      const rotationDeg = engine?.snapAngle(single.rotationDeg) ?? single.rotationDeg
      return transformPreview(base, targets, new Map([[targets[0].id, { ...targets[0].transform, rotationDeg }]]), [], `${rotationDeg.toFixed(1)}°`)
    }
    let angle = wrapAngle180(angleDegFromPivot(drag.anchorWorldX, drag.anchorWorldY, pointerWorld.x, pointerWorld.y) - drag.startAngle)
    if (engine?.angleSnappingEnabled) angle = engine.snapAngle(angle)
    else if (event.shiftKey) angle = Math.round(angle / 15) * 15
    result = rotateTransformTargets(targets, { x: drag.anchorWorldX, y: drag.anchorWorldY }, angle)
    label = `${angle.toFixed(1)}°  (${targets.length} layers)`
  } else if (drag.selectionResize) {
    const { bounds: box, handle } = drag.selectionResize, proportional = event.shiftKey || event.ctrlKey || event.metaKey
    const centered = (event.metaKey || event.ctrlKey) && event.shiftKey
    let resize = selectionResize(box, handle, delta, proportional, centered)
    if (!resize) throw new Error('The selection bounds cannot be resized. Select geometry with nonzero bounds.')
    const handleFor = (value: NonNullable<typeof resize>) => resizeHandlePoint({ x: value.pivot.x + (box.x - value.pivot.x) * value.factorX,
      y: value.pivot.y + (box.y - value.pivot.y) * value.factorY, width: box.width * value.factorX, height: box.height * value.factorY }, handle)
    // Explicit percentage scaling owns the final factors. Do not advertise a
    // grid/edge hit that subsequent factor quantization would move away from.
    if (engine?.scaleSnappingEnabled) {
      resize = { ...resize,
        factorX: proportional || /[ew]/.test(handle) ? Math.max(MIN_SCALE, MIN_SELECTION_RESIZE_EXTENT / box.width, engine.snapScale(resize.factorX)) : 1,
        factorY: proportional || /[ns]/.test(handle) ? Math.max(MIN_SCALE, MIN_SELECTION_RESIZE_EXTENT / box.height, engine.snapScale(resize.factorY)) : 1 }
    } else if (engine) {
      const originalPoint = resizeHandlePoint(box, handle), point = handleFor(resize)
      const direction = proportional ? { x: originalPoint.x - resize.pivot.x, y: originalPoint.y - resize.pivot.y }
        : handle.length === 1 ? { x: 'ew'.includes(handle) ? 1 : 0, y: 'ns'.includes(handle) ? 1 : 0 } : null
      const acquired = snapResizeHandle(point, direction, engine.radiusWorld(input.zoom), p => engine.resolvePoint(p, {
        canvasWidth: dimensions.width, canvasHeight: dimensions.height, otherLayers: bounds.others, parentBounds: bounds.parents,
        customGuides: readSceneGuides(base).guides, zoom: input.zoom }))
      resize = selectionResize(box, handle, { x: acquired.point.x - originalPoint.x, y: acquired.point.y - originalPoint.y }, proportional, centered)!
      const reached = handleFor(resize)
      guides = reachedResizeGuides(reached, acquired.guides); if (guides.length) snapPoint = reached
    }
    result = scaleTransformTargets(targets, resize.pivot, resize.factorX, resize.factorY)
    label = `${(resize.factorX * 100).toFixed(0)}% × ${(resize.factorY * 100).toFixed(0)}%  (${targets.length} layers)`
  } else {
    const axis = event.shiftKey ? 'both' : drag.axis
    const coordinates = drag.axisFrame?.invert().applyToVector(delta) ?? delta
    const factor = scaleFactorFromDelta(coordinates.x, coordinates.y, axis)
    // Preserve reflections; clamp positive factors instead of forcing a negative
    // authored scale to positive via the legacy clampScale helper.
    const fx = Math.max(MIN_SCALE, axis === 'y' ? 1 : engine?.snapScale(factor.factorX) ?? factor.factorX)
    const fy = Math.max(MIN_SCALE, axis === 'x' ? 1 : engine?.snapScale(factor.factorY) ?? factor.factorY)
    if (targets.length === 1 && !drag.axisFrame) {
      const transform = targets[0].transform
      return transformPreview(base, targets, new Map([[targets[0].id, { ...transform,
        scaleX: transform.scaleX * fx, scaleY: transform.scaleY * fy }]]), [], `${(fx * 100).toFixed(0)}% × ${(fy * 100).toFixed(0)}%`)
    }
    if (drag.pivotX === undefined || drag.pivotY === undefined) throw new Error('The selection scale pivot is missing.')
    result = scaleTransformTargets(targets, { x: drag.pivotX, y: drag.pivotY }, fx, fy, drag.axisFrame)
    label = `${(fx * 100).toFixed(0)}% × ${(fy * 100).toFixed(0)}%  (${targets.length} layers)`
  }
  if (!result.ok) throw new Error(result.reason)
  return { ...transformPreview(base, targets, new Map(result.changes.map(change => [change.id, change.transform])), guides, label), snapPoint }
}
