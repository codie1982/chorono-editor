import type { Layer } from '@/lib/types'
import type { CloneMode } from '@/lib/clone/CloneTypes'

/** Resize-handle identifiers (8-point selection frame). */
export type Handle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

export interface MoveState {
  kind: 'move'
  /** Primary (the layer actually clicked). Used for snapshot + selection focus. */
  layerId: string
  originalLayer: Layer
  /** All layers being moved together — primary + multi-selection peers.
   *  baseX/baseY are the layer's DISPLAYED position at drag start (keyframe /
   *  motionPath / followPath evaluated), so a keyframed layer drags from where
   *  it's actually shown instead of jumping to its static transform value. */
  movingLayers: { id: string; originalLayer: Layer; baseX: number; baseY: number }[]
  startClientX: number
  startClientY: number
  width:  number
  height: number
  /** Forced single-axis constraint (Move-mode axis arrows). Null = free.
   *  Distinct from Shift-while-dragging which dynamically picks the
   *  dominant axis — this is a hard lock set by the user clicking an arrow. */
  axisLock?: 'x' | 'y' | null
  /** Clone-drag (Cmd/Ctrl held at drag start). When set, the move is treated
   *  as a clone gesture: the original is dragged for live feedback, then on
   *  release a clone is created at the drop offset and the original snaps back
   *  to its start position — all in ONE undo step. Undefined = normal move. */
  cloneMode?: CloneMode
}

export interface ResizeState {
  kind: 'resize'
  layerId: string
  originalLayer: Layer
  handle: Handle
  startClientX: number
  startClientY: number
}

export interface AnchorState {
  kind: 'anchor'
  layerId: string
  originalLayer: Layer
  startClientX: number
  startClientY: number
}

/** Rotation drag — rotates the layer (or multi-select group) around a pivot. */
export interface RotateState {
  kind: 'rotate'
  layerId: string
  originalLayer: Layer
  /** Pointer position at drag start (shared with other drag kinds). */
  startClientX: number
  startClientY: number
  /** Initial angle (degrees) from anchor to pointer at drag start. */
  startAngle: number
  /** Original rotation (degrees) so we can add the delta on top. */
  originalRotation: number
  /** World coords of the layer's anchor (rotation pivot). */
  anchorWorldX: number
  anchorWorldY: number
  /** BL-03: When set, the drag rotates EVERY layer here around the common
   *  pivot (anchorWorldX/Y, which is the selection center). Each layer's
   *  origin is stored so the rotated position is computed from a stable
   *  snapshot, not the live (intermediate-render) value. */
  multiLayerOrigins?: Array<{
    layerId: string
    originalLayer: Layer
    originalX: number
    originalY: number
    originalRotation: number
  }>
}

export interface PathPointDrag {
  kind: 'pathPoint'
  layerId: string
  originalLayer: Layer
  startClientX: number
  startClientY: number
  /** Index of the anchor being moved in layer.path.anchors */
  anchorIndex: number
  /** Which part of the anchor is being moved */
  part: 'anchor' | 'inHandle' | 'outHandle'
}

/**
 * BL-66 — Pen Tool: placing a new anchor.
 *
 * On mousedown in pen mode (no hit), we begin a transaction and append a
 * provisional corner anchor at the click point. As the user drags, we
 * upgrade it to a smooth anchor with bezier handles (outHandle at the
 * cursor, inHandle mirrored). On mouseup with drag distance ≤ 5px we
 * commit a corner; otherwise we commit the smooth anchor.
 */
export interface NewAnchorDrawDrag {
  kind: 'newAnchorDraw'
  layerId: string
  originalLayer: Layer
  /** Layer-local anchor position (where the user clicked). */
  anchorX: number
  anchorY: number
  /** Client-space mousedown position to compute drag distance. */
  startClientX: number
  startClientY: number
  /** Index of the anchor that was provisionally appended. */
  anchorIndex: number
}

/** Scale-mode axis gizmo drag — modifies transform.scaleX / scaleY
 *  rather than the layer's width/height (which is what ResizeState does). */
export interface ScaleAxisState {
  kind: 'scaleAxis'
  layerId: string
  originalLayer: Layer
  /** Which axis the user grabbed: x / y / both (centre uniform). */
  axis: 'x' | 'y' | 'both'
  startClientX: number
  startClientY: number
  /** BL-03: When set, the drag scales EVERY layer here around (pivotX, pivotY).
   *  Each layer's origin snapshot is captured at drag start so positions are
   *  recomputed from a stable baseline. */
  multiLayerOrigins?: Array<{
    layerId: string
    originalLayer: Layer
    originalX: number
    originalY: number
    originalScaleX: number
    originalScaleY: number
  }>
  pivotX?: number
  pivotY?: number
}

/** BL-73 Sprint 4 — dragging a spline on-curve point. */
export interface SplinePointDrag {
  kind: 'splinePoint'
  layerId: string
  originalLayer: Layer
  pointId: string
  startClientX: number
  startClientY: number
  /** Local point position at drag start. */
  startX: number
  startY: number
}

/** BL-73 Sprint 4 — dragging a spline bezier handle. */
export interface SplineHandleDrag {
  kind: 'splineHandle'
  layerId: string
  originalLayer: Layer
  pointId: string
  handleKind: 'in' | 'out'
  startClientX: number
  startClientY: number
  /** Local handle position at drag start. */
  startX: number
  startY: number
}

export type ActiveDrag =
  | MoveState
  | ResizeState
  | AnchorState
  | PathPointDrag
  | NewAnchorDrawDrag
  | RotateState
  | ScaleAxisState
  | SplinePointDrag
  | SplineHandleDrag

/** CSS cursor for each resize handle (diagonal pairs share a cursor). */
export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n:  'ns-resize',   s:  'ns-resize',
  e:  'ew-resize',   w:  'ew-resize',
}
