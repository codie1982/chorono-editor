// ── SimilarityMatcher (BL-60) ────────────────────────────────────────────────
// Implements "Select Similar" — find every layer that matches a reference
// layer on chosen criteria (scale / rotation / position / type / opacity).
// Each criterion has its own tolerance + can be toggled independently.
//
// Pure functions; no React, no state. Drives the Select Similar tab in
// SelectionPanel.

import type { Layer } from '../types'
import type { SimilarityOptions } from './types'
import { angleNear } from './predicates'

// ─────────────────────────────────────────────────────────────────────────────
// Per-criterion matchers
// ─────────────────────────────────────────────────────────────────────────────

/** Average scale (mean of scaleX + scaleY) within ± `tolerancePct` % of ref. */
export function sameScale(ref: Layer, candidate: Layer, tolerancePct: number): boolean {
  const refAvg = (ref.transform.scaleX + ref.transform.scaleY) / 2
  const candAvg = (candidate.transform.scaleX + candidate.transform.scaleY) / 2
  const allowed = Math.abs(refAvg) * (tolerancePct / 100)
  // Special-case zero-scale ref: any layer within `tolerancePct/100` of zero
  if (refAvg === 0) return Math.abs(candAvg) <= tolerancePct / 100
  return Math.abs(candAvg - refAvg) <= allowed
}

/** Rotation within ± `toleranceDeg` ° of ref (wraparound-aware). */
export function sameRotation(ref: Layer, candidate: Layer, toleranceDeg: number): boolean {
  return angleNear(ref.transform.rotationDeg, candidate.transform.rotationDeg, toleranceDeg)
}

/** Distance from canvas edges matches the reference within `tolerancePx`.
 *  "Matching position" = same distance from all four edges, i.e. the layer
 *  sits in roughly the same screen region as the reference. */
export function sameEdgeDistance(
  ref: Layer, candidate: Layer,
  canvas: { width: number; height: number },
  tolerancePx: number,
): boolean {
  const refEdges  = edgeDistances(ref, canvas)
  const candEdges = edgeDistances(candidate, canvas)
  return Math.abs(refEdges.left   - candEdges.left)   <= tolerancePx
      && Math.abs(refEdges.right  - candEdges.right)  <= tolerancePx
      && Math.abs(refEdges.top    - candEdges.top)    <= tolerancePx
      && Math.abs(refEdges.bottom - candEdges.bottom) <= tolerancePx
}

/** Type field exact-match. */
export function sameType(ref: Layer, candidate: Layer): boolean {
  return ref.type === candidate.type
}

/** Opacity within ± `tolerance` of ref. */
export function sameOpacity(ref: Layer, candidate: Layer, tolerance: number): boolean {
  return Math.abs(ref.opacity - candidate.opacity) <= tolerance
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite matcher
// ─────────────────────────────────────────────────────────────────────────────

/** Find every layer in `all` that satisfies the enabled criteria from `opts`
 *  relative to `ref`. The reference layer itself is INCLUDED so the panel
 *  can replace the selection with the full matched set (mirrors 3ds Max
 *  "Select Similar" behavior — the ref stays selected). */
export function findSimilar(
  ref: Layer,
  all: Layer[],
  opts: SimilarityOptions,
  canvas: { width: number; height: number },
): Layer[] {
  return all.filter((l) => matchesAllCriteria(ref, l, opts, canvas))
}

/** Same as findSimilar but returns just the ids. */
export function findSimilarIds(
  ref: Layer,
  all: Layer[],
  opts: SimilarityOptions,
  canvas: { width: number; height: number },
): Set<string> {
  const ids = new Set<string>()
  for (const l of all) {
    if (matchesAllCriteria(ref, l, opts, canvas)) ids.add(l.id)
  }
  return ids
}

/** True when the layer passes every enabled match toggle.
 *  When NO toggles are enabled, returns true for every layer (no filter
 *  effectively means "select all" — caller should warn user about this). */
export function matchesAllCriteria(
  ref: Layer, candidate: Layer,
  opts: SimilarityOptions,
  canvas: { width: number; height: number },
): boolean {
  if (opts.matchType     && !sameType(ref, candidate)) return false
  if (opts.matchScale    && !sameScale(ref, candidate, opts.scaleTolerancePct)) return false
  if (opts.matchRotation && !sameRotation(ref, candidate, opts.rotationToleranceDeg)) return false
  if (opts.matchPosition && !sameEdgeDistance(ref, candidate, canvas, opts.positionTolerancePx)) return false
  if (opts.matchOpacity  && !sameOpacity(ref, candidate, opts.opacityTolerance)) return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

interface EdgeDistances {
  left: number; right: number; top: number; bottom: number
}

/** Distances from each canvas edge to the LAYER's anchor point. Coarse
 *  but cheap — doesn't account for rotation or non-uniform scale. Good
 *  enough for "is this layer in roughly the same screen region as the ref".
 */
function edgeDistances(layer: Layer, canvas: { width: number; height: number }): EdgeDistances {
  const x = layer.transform.x + (layer.transform.anchorX ?? 0)
  const y = layer.transform.y + (layer.transform.anchorY ?? 0)
  return {
    left:   x,
    right:  canvas.width  - x,
    top:    y,
    bottom: canvas.height - y,
  }
}
