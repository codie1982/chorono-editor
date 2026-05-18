// ── Bezier Path Editing Operations ────────────────────────────────────────────
// Pure functions — every op returns a new path; nothing is mutated.

import type { BezierPath, PathAnchor } from '@/lib/types'

/** Replace a single anchor at index i with a new one. */
export function setAnchor(path: BezierPath, i: number, patch: Partial<PathAnchor>): BezierPath {
  if (i < 0 || i >= path.anchors.length) return path
  const next = path.anchors.slice()
  next[i] = { ...next[i], ...patch }
  return { ...path, anchors: next }
}

/**
 * Move an anchor by (dx, dy). When pointType is 'smooth' or 'mirror', the
 * handles move WITH the anchor (relative-position invariant).
 */
export function moveAnchor(path: BezierPath, i: number, dx: number, dy: number): BezierPath {
  if (i < 0 || i >= path.anchors.length) return path
  const a = path.anchors[i]
  const patch: Partial<PathAnchor> = {
    x: a.x + dx,
    y: a.y + dy,
  }
  if (a.inX  !== undefined) patch.inX  = a.inX  + dx
  if (a.inY  !== undefined) patch.inY  = a.inY  + dy
  if (a.outX !== undefined) patch.outX = a.outX + dx
  if (a.outY !== undefined) patch.outY = a.outY + dy
  return setAnchor(path, i, patch)
}

/**
 * Move the 'in' handle of anchor i. If pointType is 'smooth' or 'mirror',
 * the opposite (out) handle is also updated to stay collinear (mirror also
 * matches length).
 */
export function moveInHandle(path: BezierPath, i: number, x: number, y: number): BezierPath {
  const a = path.anchors[i]
  if (!a) return path
  const patch: Partial<PathAnchor> = { inX: x, inY: y }
  if (a.pointType === 'smooth' || a.pointType === 'mirror') {
    const dx = a.x - x, dy = a.y - y   // vector from new-in to anchor
    if (a.pointType === 'mirror') {
      patch.outX = a.x + dx
      patch.outY = a.y + dy
    } else if (a.outX !== undefined && a.outY !== undefined) {
      const outLen = Math.hypot(a.outX - a.x, a.outY - a.y)
      const inLen  = Math.hypot(dx, dy) || 1
      patch.outX = a.x + (dx / inLen) * outLen
      patch.outY = a.y + (dy / inLen) * outLen
    }
  }
  return setAnchor(path, i, patch)
}

/** Symmetric counterpart of moveInHandle. */
export function moveOutHandle(path: BezierPath, i: number, x: number, y: number): BezierPath {
  const a = path.anchors[i]
  if (!a) return path
  const patch: Partial<PathAnchor> = { outX: x, outY: y }
  if (a.pointType === 'smooth' || a.pointType === 'mirror') {
    const dx = a.x - x, dy = a.y - y
    if (a.pointType === 'mirror') {
      patch.inX = a.x + dx
      patch.inY = a.y + dy
    } else if (a.inX !== undefined && a.inY !== undefined) {
      const inLen  = Math.hypot(a.inX - a.x, a.inY - a.y)
      const outLen = Math.hypot(dx, dy) || 1
      patch.inX = a.x + (dx / outLen) * inLen
      patch.inY = a.y + (dy / outLen) * inLen
    }
  }
  return setAnchor(path, i, patch)
}

/** Insert a new anchor at index i (existing anchors at >= i shift right by 1). */
export function insertAnchor(path: BezierPath, i: number, anchor: PathAnchor): BezierPath {
  const next = path.anchors.slice()
  next.splice(Math.max(0, Math.min(next.length, i)), 0, anchor)
  return { ...path, anchors: next }
}

export function appendAnchor(path: BezierPath, anchor: PathAnchor): BezierPath {
  return { ...path, anchors: [...path.anchors, anchor] }
}

/** Remove anchor at index i. No-op if it would leave fewer than 2 anchors. */
export function deleteAnchor(path: BezierPath, i: number): BezierPath {
  if (path.anchors.length <= 2) return path
  if (i < 0 || i >= path.anchors.length) return path
  const next = path.anchors.slice()
  next.splice(i, 1)
  return { ...path, anchors: next }
}

/** Cycle pointType through corner → smooth → mirror → corner. */
export function cyclePointType(path: BezierPath, i: number): BezierPath {
  const a = path.anchors[i]
  if (!a) return path
  const next: PathAnchor['pointType'] =
      a.pointType === 'corner' ? 'smooth'
    : a.pointType === 'smooth' ? 'mirror'
    : 'corner'
  return setAnchor(path, i, { pointType: next })
}

/** Toggle open / closed. */
export function togglePathClosed(path: BezierPath): BezierPath {
  return { ...path, closed: !path.closed }
}

/** Reverse anchor order. Also swaps in/out handles per anchor. */
export function reversePath(path: BezierPath): BezierPath {
  const reversed = path.anchors.slice().reverse().map(a => ({
    ...a,
    inX:  a.outX, inY:  a.outY,
    outX: a.inX,  outY: a.inY,
  }))
  return { ...path, anchors: reversed }
}

// ── Hit-test helpers used by the Pen Tool ─────────────────────────────────────

export interface AnchorHandleHit {
  type: 'anchor' | 'inHandle' | 'outHandle'
  anchorIndex: number
}

/**
 * Tests whether (lx, ly) — in layer-local coords — hits an anchor or handle.
 * Returns the first hit found (anchors checked before handles → easier grab).
 * `radius` is the click tolerance in canvas pixels.
 */
export function hitTestPath(path: BezierPath, lx: number, ly: number, radius = 6): AnchorHandleHit | null {
  // Anchors first (drawn on top)
  for (let i = 0; i < path.anchors.length; i++) {
    const a = path.anchors[i]
    if (Math.hypot(a.x - lx, a.y - ly) <= radius) {
      return { type: 'anchor', anchorIndex: i }
    }
  }
  // Then handles
  for (let i = 0; i < path.anchors.length; i++) {
    const a = path.anchors[i]
    if (a.inX  !== undefined && a.inY  !== undefined &&
        Math.hypot(a.inX  - lx, a.inY  - ly) <= radius) {
      return { type: 'inHandle', anchorIndex: i }
    }
    if (a.outX !== undefined && a.outY !== undefined &&
        Math.hypot(a.outX - lx, a.outY - ly) <= radius) {
      return { type: 'outHandle', anchorIndex: i }
    }
  }
  return null
}

// ── Segment hit-test + anchor insertion (BL-03) ──────────────────────────────
// "Click on a segment to insert an anchor" — same UX as Figma / Illustrator.
// Implemented as: cubic-sample each segment, find the nearest curve point to
// the click, then split that segment via De Casteljau so the visual shape
// stays identical after insertion.

interface XY { x: number; y: number }

/** Sample one point on a cubic bezier defined by four control points at t∈[0,1]. */
function cubicBezierPoint(p0: XY, p1: XY, p2: XY, p3: XY, t: number): XY {
  const u = 1 - t
  const uu = u * u, uuu = uu * u
  const tt = t * t, ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

/** Build the four control points for the segment starting at anchor index i.
 *  Missing handles fall back to the anchor position (degenerate corner). */
function segmentControlPoints(path: BezierPath, i: number): { p0: XY; p1: XY; p2: XY; p3: XY } | null {
  const aCount = path.anchors.length
  if (aCount < 2) return null
  const a = path.anchors[i]
  // Closing segment wraps from last anchor back to first
  const isClosingSeg = i === aCount - 1
  if (isClosingSeg && !path.closed) return null
  const b = path.anchors[(i + 1) % aCount]
  return {
    p0: { x: a.x, y: a.y },
    p1: { x: a.outX ?? a.x, y: a.outY ?? a.y },
    p2: { x: b.inX  ?? b.x, y: b.inY  ?? b.y },
    p3: { x: b.x, y: b.y },
  }
}

export interface SegmentHit {
  /** Index of the anchor where the hit segment STARTS (segment is i → i+1). */
  segmentIndex: number
  /** Parameter along the segment, 0..1. */
  t: number
  /** Layer-local hit position (on the curve, after refinement). */
  hitX: number
  hitY: number
  /** Distance from the click to the curve in layer-local pixels. */
  distance: number
}

/** Find the closest curve segment within `radius` of (lx, ly). Returns null
 *  when no segment is within reach. Excludes hits near existing anchors so
 *  the hit-test for anchors (hitTestPath) takes priority — segment-click is
 *  only meaningful for the middle of a segment.
 *
 *  Sampling: ~32 points per segment plus a 16-sample refinement around the
 *  nearest sample. Good for typical curves; pathological loops at very small
 *  zoom may miss but that's a UX edge case.
 */
export function hitTestSegment(
  path: BezierPath,
  lx: number, ly: number,
  radius = 5,
): SegmentHit | null {
  const aCount = path.anchors.length
  if (aCount < 2) return null
  const segCount = path.closed ? aCount : aCount - 1

  let best: SegmentHit | null = null
  for (let i = 0; i < segCount; i++) {
    const cp = segmentControlPoints(path, i)
    if (!cp) continue
    const { p0, p1, p2, p3 } = cp

    // Coarse pass
    let bestT = 0, bestDist = Infinity
    const COARSE = 32
    for (let s = 0; s <= COARSE; s++) {
      const t = s / COARSE
      const p = cubicBezierPoint(p0, p1, p2, p3, t)
      const d = Math.hypot(p.x - lx, p.y - ly)
      if (d < bestDist) { bestDist = d; bestT = t }
    }

    if (bestDist > radius) continue

    // Refine around bestT
    const REFINE = 16
    const tMin = Math.max(0, bestT - 1 / COARSE)
    const tMax = Math.min(1, bestT + 1 / COARSE)
    let refinedT = bestT, refinedDist = bestDist
    for (let s = 0; s <= REFINE; s++) {
      const t = tMin + (tMax - tMin) * (s / REFINE)
      const p = cubicBezierPoint(p0, p1, p2, p3, t)
      const d = Math.hypot(p.x - lx, p.y - ly)
      if (d < refinedDist) { refinedDist = d; refinedT = t }
    }

    // Reject hits too close to an anchor — those belong to hitTestPath
    if (refinedT < 0.02 || refinedT > 0.98) continue

    const hit = cubicBezierPoint(p0, p1, p2, p3, refinedT)
    if (!best || refinedDist < best.distance) {
      best = {
        segmentIndex: i,
        t: refinedT,
        hitX: hit.x, hitY: hit.y,
        distance: refinedDist,
      }
    }
  }
  return best
}

/** De Casteljau split: returns left and right cubics that, composed, equal the
 *  original between t=0..1. Used by insertAnchorOnSegment to add a midpoint
 *  without changing the curve's visual shape. */
function deCasteljauSplit(
  p0: XY, p1: XY, p2: XY, p3: XY, t: number,
): { left: [XY, XY, XY, XY]; right: [XY, XY, XY, XY] } {
  const lerp = (a: XY, b: XY): XY => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const q0 = lerp(p0, p1)
  const q1 = lerp(p1, p2)
  const q2 = lerp(p2, p3)
  const r0 = lerp(q0, q1)
  const r1 = lerp(q1, q2)
  const s0 = lerp(r0, r1) // split point — on the curve
  return {
    left:  [p0, q0, r0, s0],
    right: [s0, r1, q2, p3],
  }
}

/** Insert a new anchor on the given segment at parameter t, splitting the
 *  cubic so the path's visual shape stays identical. The two adjacent
 *  anchors' handles are updated to match the split.
 *
 *  segmentIndex: 0..N-2 for open paths, 0..N-1 for closed paths (the last
 *  index refers to the closing segment from anchors[N-1] back to anchors[0]).
 */
export function insertAnchorOnSegment(
  path: BezierPath,
  segmentIndex: number,
  t: number,
): BezierPath {
  const cp = segmentControlPoints(path, segmentIndex)
  if (!cp) return path
  const { p0, p1, p2, p3 } = cp

  const { left, right } = deCasteljauSplit(p0, p1, p2, p3, t)

  const aIdx = segmentIndex
  const bIdx = (segmentIndex + 1) % path.anchors.length

  const aOld = path.anchors[aIdx]
  const bOld = path.anchors[bIdx]

  // Update neighbouring handles so the split point sits naturally on the curve
  const aNew: PathAnchor = { ...aOld, outX: left[1].x, outY: left[1].y }
  const bNew: PathAnchor = { ...bOld, inX:  right[2].x, inY:  right[2].y }

  // The new anchor is at the split (left[3] === right[0]) with smooth handles
  // (left[2] becomes its incoming handle, right[1] its outgoing handle).
  const newAnchor: PathAnchor = {
    x: left[3].x, y: left[3].y,
    inX:  left[2].x, inY:  left[2].y,
    outX: right[1].x, outY: right[1].y,
    pointType: 'smooth',
  }

  const next = path.anchors.slice()
  next[aIdx] = aNew
  next[bIdx] = bNew
  // Insert AFTER aIdx. For the closing segment (aIdx === N-1) this appends
  // at the end of the array — bIdx wraps back to 0, which is fine.
  next.splice(aIdx + 1, 0, newAnchor)

  return { ...path, anchors: next }
}
