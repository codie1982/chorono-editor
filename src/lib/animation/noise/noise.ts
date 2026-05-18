/** Deterministic noise primitives (BL-47).
 *
 *  Math.random() is forbidden — runtime must reproduce the same noise on
 *  every device. We use a 32-bit FNV-1a hash to seed a sin-based hash
 *  (cheap, no crypto), then build value-noise + fbm on top of that.
 *
 *  All functions are pure. The `seed` argument lets the caller bind a
 *  modifier's identity into the noise so two sine-noise modifiers on the
 *  same track produce DIFFERENT wave shapes even with the same params.
 */

// ── Cheap deterministic hash → [0, 1) ──────────────────────────────────────
// Math.sin trick is well-known; not cryptographic but evenly distributed
// enough for visual noise. Multiplying by a long prime breaks up periodicity
// of sin's natural fundamental.
function fract(x: number): number {
  return x - Math.floor(x)
}

export function hash1(n: number, seed = 0): number {
  const x = Math.sin((n + seed) * 127.1) * 43758.5453123
  return fract(x)
}

/** Signed hash → [-1, 1). */
export function shash1(n: number, seed = 0): number {
  return hash1(n, seed) * 2 - 1
}

// ── 1-D Value Noise ───────────────────────────────────────────────────────
// Smooth interpolation between hashes at integer positions. Smoothstep
// gives C¹ continuity at integers (matching 3ds Max noise feel).
function smoothstep(u: number): number {
  return u * u * (3 - 2 * u)
}

/** Smooth value noise → [0, 1). */
export function valueNoise1D(x: number, seed = 0): number {
  const i = Math.floor(x)
  const f = x - i
  const a = hash1(i,     seed)
  const b = hash1(i + 1, seed)
  return a + (b - a) * smoothstep(f)
}

/** Signed smooth noise → [-1, 1). */
export function signedNoise1D(x: number, seed = 0): number {
  return valueNoise1D(x, seed) * 2 - 1
}

// ── Fractal Brownian Motion (fBm) ─────────────────────────────────────────
// Multi-octave summation — the classic "perlin texture" recipe. lacunarity
// > 1 increases frequency per octave, gain < 1 decays amplitude. Defaults
// give the standard fractal noise look.
//
// Performance: fBm with octaves=4-8 is the most expensive primitive in
// the modifier pipeline. We memoize on a quantized x (3-decimal precision
// — invisible at typical FPS) per (seed/octaves/lacunarity/gain) bucket.
// 4096 entry LRU keeps memory bounded; FIFO eviction is fine here.

const FBM_CACHE_LIMIT = 4096
const fbmCache: Map<string, number> = new Map()

export function fbm1D(
  x: number,
  seed:        number,
  octaves:     number,
  lacunarity:  number,
  gain:        number,
): number {
  // Quantize x to 1e-3 — at 60fps that's sub-frame precision for any
  // realistic frequency, indistinguishable visually but huge cache hits
  // during canvas + minimap + curve editor co-rendering the same frame.
  const xKey = Math.round(x * 1000) / 1000
  const k = `${seed}|${octaves}|${lacunarity}|${gain}|${xKey}`
  const hit = fbmCache.get(k)
  if (hit !== undefined) return hit

  let value     = 0
  let amp       = 1
  let freq      = 1
  let normalize = 0
  for (let i = 0; i < octaves; i++) {
    value     += signedNoise1D(x * freq, seed + i * 101) * amp
    normalize += amp
    freq      *= lacunarity
    amp       *= gain
  }
  const out = normalize > 0 ? value / normalize : 0

  if (fbmCache.size >= FBM_CACHE_LIMIT) {
    // FIFO eviction — Map iteration order = insertion order.
    const firstKey = fbmCache.keys().next().value
    if (firstKey !== undefined) fbmCache.delete(firstKey)
  }
  fbmCache.set(k, out)
  return out
}

/** Test / debug helper — drop the fbm cache (used by unit tests asserting
 *  cold-path behavior). Not part of the runtime API. */
export function _clearFbmCacheForTests(): void { fbmCache.clear() }

// ── Envelope (BL-46 lib copy — kept local so this module is self-contained)
function envelopeRamp(localT: number, rampIn: number, rampOut: number): number {
  let v = 1
  if (rampIn  > 0 && localT < rampIn)        v *= smoothstep(localT / rampIn)
  if (rampOut > 0 && localT > 1 - rampOut)   v *= smoothstep((1 - localT) / rampOut)
  return v
}
export { envelopeRamp }
