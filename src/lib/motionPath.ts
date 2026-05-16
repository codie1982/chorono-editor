// ── Motion path evaluator ─────────────────────────────────────────────────────
// Uses an off-DOM SVGPathElement so we can call getTotalLength / getPointAtLength.
// Cached per path string to avoid re-parsing on every animation frame.

export interface PointOnPath {
  x: number
  y: number
  rotationDeg: number
}

interface CacheEntry {
  el: SVGPathElement
  length: number
}

const cache = new Map<string, CacheEntry>()

function getCachedPath(pathData: string): CacheEntry | null {
  if (typeof document === 'undefined') return null
  let entry = cache.get(pathData)
  if (entry) return entry

  try {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    el.setAttribute('d', pathData)
    const length = el.getTotalLength()
    entry = { el, length }
    cache.set(pathData, entry)
    return entry
  } catch {
    return null
  }
}

/**
 * Resolve a point along the path. `offset` is 0–1 along the path's total length.
 * `rotationDeg` is the tangent direction (use only when autoRotate is enabled).
 */
export function evaluateMotionPath(pathData: string, offset: number): PointOnPath | null {
  const entry = getCachedPath(pathData)
  if (!entry || entry.length === 0) return null

  const o = Math.max(0, Math.min(1, offset))
  const len = entry.length * o
  const pt  = entry.el.getPointAtLength(len)

  // Tangent: sample a small step ahead (or behind near the end) for the direction
  const epsilon = Math.min(1, entry.length * 0.001)
  const sampleAt = len + epsilon <= entry.length ? len + epsilon : len - epsilon
  const tangent  = entry.el.getPointAtLength(sampleAt)
  const dx = sampleAt > len ? tangent.x - pt.x : pt.x - tangent.x
  const dy = sampleAt > len ? tangent.y - pt.y : pt.y - tangent.y
  const rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI

  return { x: pt.x, y: pt.y, rotationDeg }
}

/** Free cached SVG path entries (called when scene clears or for memory pressure). */
export function clearMotionPathCache(): void {
  cache.clear()
}
