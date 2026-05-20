// ── SM Override Blending (BL-09) ────────────────────────────────────────────
// Cross-fade between two timelines' evaluated outputs during a state
// transition. Both OverrideMaps are `property path → number`; we lerp each
// property the two states share so e.g. a layer's colour/position glides from
// the "summer" value to the "winter" value with no opacity ghosting.
//
// alpha = 0 → fully `from`,  alpha = 1 → fully `to`.

import type { OverrideMap } from '../evaluator'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * Weighted blend of two override maps.
 *  • key in BOTH  → linear interpolate (property interpolation, no ghost)
 *  • key only in `to`   → fade in from its own value (lerp from itself = itself)
 *  • key only in `from` → kept as-is; there is no target to fade toward, so it
 *    lingers until the blend completes and the runtime drops the `from`
 *    timeline entirely. Acceptable for the common same-layer case.
 */
export function blendOverrides(from: OverrideMap, to: OverrideMap, alpha: number): OverrideMap {
  const a = clamp01(alpha)
  // Fast paths at the extremes avoid allocating/looping mid-transition.
  if (a <= 0) return from
  if (a >= 1) return to

  const out: OverrideMap = new Map(from)
  to.forEach((toVal, key) => {
    const fromVal = from.get(key)
    out.set(key, fromVal === undefined ? toVal : fromVal * (1 - a) + toVal * a)
  })
  return out
}
