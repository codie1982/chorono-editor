// ── Snap Candidate model ──────────────────────────────────────────────────
// Shared vocabulary every snap collector (canvas/spline/timeline/modifier)
// returns and the engine consumes. Designed forward — BL-27 (vertex/segment),
// BL-28 (angle), BL-29 (scale percent), BL-30 (smart guides) all plug into
// this exact shape, no engine changes required when they ship.
//
// Today only `canvas-edge` / `canvas-center` / `layer-edge` / `layer-center`
// types are emitted by CanvasSnapCollector (delegating to AlignmentGuides).

import type { Guide } from './AlignmentGuides'

export type SnapTargetType =
  // Canvas snap (BL-26)
  | 'canvasEdge'   | 'canvasCenter'
  | 'objectBounds' | 'objectCenter' | 'objectEdge'
  | 'grid'         | 'pixel'        | 'guide'
  // Spline / pen snap (BL-27)
  | 'vertex'       | 'segmentMidpoint' | 'segmentProjection'
  | 'pathTangent'  | 'pivot'
  // Gizmo snap (BL-28/29)
  | 'angle'        | 'scaleStep'
  // Timeline snap (already lives in lib/timeline/snapping.ts — listed for
  // future unification under BL-26 if we ever merge the two namespaces)
  | 'timelineFrame' | 'timelineKeyframe' | 'timelineMarker' | 'workArea'

export interface Vec2 { x: number; y: number }

/** A potential snap target collected by one of the collectors. Engine
 *  ranks candidates by priority + proximity, picks the winner per axis. */
export interface SnapCandidate {
  type: SnapTargetType
  /** Point-type snaps (vertex / segment midpoint). */
  point?: Vec2
  /** Axis-line snaps (canvas edges, layer edges, grid lines). */
  axis?: 'v' | 'h'
  position?: number
  /** Higher wins on ties. Engine sorts by priority * 1000 - distancePx. */
  priority: number
  /** Origin label — useful for debugging + the snap tooltip. */
  label: string
  sourceLayerId?: string
}

/** Final snap outcome returned by SnapEngine. */
export interface SnapResult {
  snapped: boolean
  /** Snapped point in composition coords. Equals input when not snapped. */
  point: Vec2
  /** Delta applied = (point - input). */
  delta: Vec2
  /** Lines to render this frame (pink centre, amber edge — see SceneCanvas). */
  guides: Guide[]
  /** Winning candidate per axis, if any. */
  candidate?: SnapCandidate
}

/** Source rectangle for canvas snaps. */
export interface SnapRect { x: number; y: number; width: number; height: number }
