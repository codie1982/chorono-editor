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
