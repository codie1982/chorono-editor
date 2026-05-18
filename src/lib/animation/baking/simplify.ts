/** Ramer-Douglas-Peucker simplification (BL-51).
 *
 *  Reduces a sampled (time, value) sequence to a smaller set of
 *  representative points while keeping the visual shape within
 *  `epsilon` of the original. Used after baking modifier-driven curves
 *  to keep the keyframe count low for runtime export.
 *
 *  Classic RDP: for any sub-range, find the point with the maximum
 *  perpendicular distance from the line connecting the range endpoints.
 *  If that distance > ε, recurse on both halves; otherwise drop all
 *  intermediate points.
 *
 *  Distance metric: we treat (timeMs, value) as a 2-D space scaled to
 *  unit-normalised ranges so ε is meaningful as "fraction of full bbox".
 */

export interface Sample {
  timeMs: number
  value:  number
}

/** Simplify samples in-place equivalent — returns a NEW filtered array
 *  whose first + last elements always match `samples`. */
export function simplifyRDP(samples: Sample[], epsilon: number): Sample[] {
  if (samples.length <= 2 || epsilon <= 0) return [...samples]

  // Normalise bbox so epsilon is a fraction of total range.
  let minT = Infinity, maxT = -Infinity
  let minV = Infinity, maxV = -Infinity
  for (const s of samples) {
    if (s.timeMs < minT) minT = s.timeMs
    if (s.timeMs > maxT) maxT = s.timeMs
    if (s.value  < minV) minV = s.value
    if (s.value  > maxV) maxV = s.value
  }
  const spanT = Math.max(1e-9, maxT - minT)
  const spanV = Math.max(1e-9, maxV - minV)

  // Pre-normalise so the recursion uses cheap math. Keep an index array
  // to map back to the originals at the end.
  const norm = samples.map((s) => [
    (s.timeMs - minT) / spanT,
    (s.value  - minV) / spanV,
  ] as const)

  const keep = new Uint8Array(samples.length)
  keep[0] = 1
  keep[samples.length - 1] = 1

  const stack: [number, number][] = [[0, samples.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    if (b - a < 2) continue
    const [ax, ay] = norm[a]
    const [bx, by] = norm[b]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxDist = 0
    let maxIdx = a
    for (let i = a + 1; i < b; i++) {
      const [px, py] = norm[i]
      // Perpendicular distance — area-of-triangle / base trick.
      let dist: number
      if (len2 === 0) {
        dist = Math.hypot(px - ax, py - ay)
      } else {
        const t = ((px - ax) * dx + (py - ay) * dy) / len2
        const tc = Math.max(0, Math.min(1, t))
        const cx = ax + tc * dx, cy = ay + tc * dy
        dist = Math.hypot(px - cx, py - cy)
      }
      if (dist > maxDist) { maxDist = dist; maxIdx = i }
    }
    if (maxDist > epsilon) {
      keep[maxIdx] = 1
      stack.push([a, maxIdx], [maxIdx, b])
    }
  }

  const out: Sample[] = []
  for (let i = 0; i < samples.length; i++) {
    if (keep[i]) out.push(samples[i])
  }
  return out
}
