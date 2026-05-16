// ── Bezier Path Types ─────────────────────────────────────────────────────────
// Vector path representation used by 'path' layers and the Pen Tool editor.

/**
 * A single anchor on a vector path.
 *
 * Each anchor has an on-curve position (x, y) and two optional bezier handles
 * that control the curve entering and leaving the anchor:
 *   - inHandle  → tangent of the segment ARRIVING at this anchor
 *   - outHandle → tangent of the segment LEAVING this anchor
 *
 * Handles are stored in LAYER-LOCAL coordinates (NOT relative to the anchor).
 * If both handles equal the anchor position, the segment becomes a straight line.
 *
 * pointType drives Pen Tool behaviour when dragging handles:
 *   - 'corner'  → handles move independently (sharp corner)
 *   - 'smooth'  → handles stay collinear, lengths independent
 *   - 'mirror'  → handles stay collinear AND equal length
 */
export interface PathAnchor {
  x: number
  y: number
  /** Incoming bezier handle (controls curve into this anchor). */
  inX?:  number
  inY?:  number
  /** Outgoing bezier handle (controls curve out of this anchor). */
  outX?: number
  outY?: number
  /** Handle continuity policy. Default 'corner'. */
  pointType?: 'corner' | 'smooth' | 'mirror'
}

/**
 * A complete vector path: ordered anchors + open/closed flag.
 *
 * When `closed` is true, an additional segment is drawn from the last anchor
 * back to the first one (closing the loop). When false, the path is open
 * (useful for strokes, motion paths).
 */
export interface BezierPath {
  anchors: PathAnchor[]
  closed: boolean
}

/** Helper — create a straight-edge polygon from an array of points. */
export function pathFromPoints(points: [number, number][], closed = true): BezierPath {
  return {
    closed,
    anchors: points.map(([x, y]) => ({ x, y, pointType: 'corner' as const })),
  }
}

/** Default starter path — small square in the upper-left of the layer. */
export const DEFAULT_BEZIER_PATH: BezierPath = pathFromPoints(
  [[0, 0], [80, 0], [80, 80], [0, 80]],
  true,
)
