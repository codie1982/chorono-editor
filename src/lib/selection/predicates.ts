// ── Smart Selection — Predicates (BL-60) ──────────────────────────────────────
// Pure helpers for matching / comparing layer attributes. Used by both
// SimilarityMatcher (Select Similar) and TransformQueryBuilder (Select By
// Transform). No side effects, no state.

/** Normalize a degree value into the [-180, 180] half-open range. */
export function normalizeAngle(deg: number): number {
  let d = deg % 360
  if (d > 180)  d -= 360
  if (d <= -180) d += 360
  return d
}

/** True when two angles are within `toleranceDeg` of each other, accounting
 *  for wraparound (350° is "close to" 10° if tolerance ≥ 20). */
export function angleNear(a: number, b: number, toleranceDeg: number): boolean {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  // diff can be up to 360 here when a/b sit on opposite sides of the -180/180 cut
  return Math.min(diff, 360 - diff) <= toleranceDeg
}

/** Two 2D vectors are within `tolerancePx` Euclidean distance. */
export function nearVector(
  a: { x: number; y: number },
  b: { x: number; y: number },
  tolerancePx: number,
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerancePx
}

/** Two AABBs intersect (touching counts). */
export function boundsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  )
}

/** True when |a - b| ≤ tolerance. Simple numeric proximity used by 'near' op. */
export function numberNear(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance
}

/** True when `value` falls within [min, max] (inclusive). */
export function inRange(value: number, min: number, max: number): boolean {
  return value >= Math.min(min, max) && value <= Math.max(min, max)
}

/** Case-aware string equality with optional ignoreCase. */
export function stringEquals(a: string, b: string, ignoreCase = true): boolean {
  return ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Case-aware substring containment with optional ignoreCase. */
export function stringContains(haystack: string, needle: string, ignoreCase = true): boolean {
  if (ignoreCase) return haystack.toLowerCase().includes(needle.toLowerCase())
  return haystack.includes(needle)
}

/** Case-aware startsWith / endsWith. */
export function stringStartsWith(haystack: string, prefix: string, ignoreCase = true): boolean {
  if (ignoreCase) return haystack.toLowerCase().startsWith(prefix.toLowerCase())
  return haystack.startsWith(prefix)
}

export function stringEndsWith(haystack: string, suffix: string, ignoreCase = true): boolean {
  if (ignoreCase) return haystack.toLowerCase().endsWith(suffix.toLowerCase())
  return haystack.endsWith(suffix)
}
