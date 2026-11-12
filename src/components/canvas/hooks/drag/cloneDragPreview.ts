import type { ChronoScene } from '@/lib/types'
import { prepareCloneForest } from '@/lib/editor/commands-clone-forest'
import type { MoveState } from '../../types/canvasDragTypes'
import type { CanvasDragPreview, CanvasPointerSample } from './dragTypes'

/** Prepare one forest and its stable layer/key IDs for a single copy gesture.
 * Offsets are supplied per preview in the ROOT PARENT's local pixels. The
 * borrowed source scene remains the command baseline until commit/cancel. */
export function prepareCloneDrag(base: ChronoScene, drag: MoveState) {
  return prepareCloneForest(base, {
    sourceIds: drag.targets?.map(target => target.id) ?? drag.movingLayers.map(item => item.id),
    mode: drag.cloneMode, duplicateAnimation: true,
  })
}

/** Convert an ordinary evaluated move sample into a real copy-only preview.
 * The original move sample is used for snap/math only; its changed source
 * layers/overrides are discarded. Subtract the EVALUATED start, never authored
 * x/y: keys can place the source far from its fallback at the current frame.
 * No source/clone scene edit appears until the three-CSS-pixel threshold. */
export function previewCloneDrag(base: ChronoScene, drag: MoveState,
  plan: ReturnType<typeof prepareCloneDrag>, moved: CanvasDragPreview,
  event: CanvasPointerSample): CanvasDragPreview {
  if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 3
      || !moved.changes.length) return { ...moved, scene: base, changes: [], overrides: new Map() }
  const command = plan.atOffsets(cloneDragOffsets(drag, moved))
  return { ...moved, scene: command.execute(base), overrides: new Map(), cloneCommand: command }
}

/** Root-parent-local delta from the evaluated drag pose, shared by the live
 * preview and compatibility commit adapter. No source fallback is subtracted. */
export function cloneDragOffsets(drag: MoveState, moved: CanvasDragPreview) {
  const origins = drag.targets?.map(target => ({ id: target.id, x: target.transform.x, y: target.transform.y }))
    ?? drag.movingLayers.map(item => ({ id: item.id, x: item.baseX, y: item.baseY }))
  return Object.fromEntries(origins.map(origin => [origin.id, {
    x: (moved.overrides.get(`layers.${origin.id}.transform.x`) ?? origin.x) - origin.x,
    y: (moved.overrides.get(`layers.${origin.id}.transform.y`) ?? origin.y) - origin.y,
  }]))
}
