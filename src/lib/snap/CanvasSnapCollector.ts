// ── Canvas Snap Collector ─────────────────────────────────────────────────
// Wraps the legacy AlignmentGuides math so SnapEngine doesn't have to know
// about the underlying axis-line representation. When BL-27/30 add new
// collectors (SplineSnapCollector, SmartGuideEngine), they implement the
// same shape and the engine treats them identically.
//
// Pure pass-through for now — the math itself stays in AlignmentGuides.ts
// because it's battle-tested via SceneCanvas. Future refactors can move
// the implementation in here without affecting callers.

import {
  buildSnapTargets, snapRect as snapRectLegacy,
  type Rect, type SnapTarget,
} from './AlignmentGuides'
import type { SnapResult, SnapRect } from './SnapCandidate'

export interface CanvasSnapContext {
  canvasWidth:  number
  canvasHeight: number
  /** Other layers on the canvas — the moving one(s) excluded by the caller. */
  otherLayers: Array<Rect & { id: string }>
}

/** Pluggable collector contract — every future collector implements this. */
export interface SnapCollector<TInput, TOutput> {
  collect(input: TInput): TOutput
}

export class CanvasSnapCollector implements SnapCollector<CanvasSnapContext, SnapTarget[]> {
  collect(ctx: CanvasSnapContext): SnapTarget[] {
    return buildSnapTargets(ctx.canvasWidth, ctx.canvasHeight, ctx.otherLayers)
  }

  /** Apply object-snap (canvas + layer edges/centres) to a rectangle. */
  snapRect(rect: SnapRect, ctx: CanvasSnapContext, thresholdPx: number): SnapResult {
    const targets = this.collect(ctx)
    const res = snapRectLegacy(rect, targets, thresholdPx)
    const dx = res.x - rect.x
    const dy = res.y - rect.y
    return {
      snapped: res.guides.length > 0,
      point:   { x: res.x, y: res.y },
      delta:   { x: dx, y: dy },
      guides:  res.guides,
    }
  }
}

/** Singleton — collectors are stateless, no reason to re-instantiate. */
export const canvasSnap = new CanvasSnapCollector()
