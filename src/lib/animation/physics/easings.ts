/** Stateless physics easings (BL-49).
 *
 *  Robert Penner-style closed-form curves — no integration, no state,
 *  same input always produces the same output. Used by Overshoot /
 *  Elastic / Bounce / Decay modifier evaluators.
 *
 *  Each function takes u ∈ [0, 1] (segment-normalised time) and returns
 *  an EASING multiplier — same shape as a CSS easing function: 0 at u=0,
 *  1 at u=1, free shape in between (can overshoot).
 *
 *  Modifiers blend these into the base value via the standard
 *  applyModifiers pipeline (BL-46).
 */

/** Overshoot — value goes past 1 then settles back. tension>0 controls how
 *  far it overshoots. Classic UI "pop" feeling. */
export function overshootOut(u: number, tension = 1.70158): number {
  const t = u - 1
  return t * t * ((tension + 1) * t + tension) + 1
}

/** Elastic — wobbles back and forth around the target. amplitude controls
 *  initial wobble size, period the wobble frequency. */
export function elasticOut(u: number, amplitude = 1, period = 0.3): number {
  if (u === 0) return 0
  if (u === 1) return 1
  const s = period / (2 * Math.PI) * Math.asin(1 / Math.max(amplitude, 1))
  return amplitude * Math.pow(2, -10 * u) *
         Math.sin((u - s) * (2 * Math.PI) / period) + 1
}

/** Bounce — accelerating drops with decreasing amplitude. Five-segment
 *  approximation Penner used; matches CSS / Greensock bounce exactly. */
export function bounceOut(u: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (u < 1 / d1) {
    return n1 * u * u
  }
  if (u < 2 / d1) {
    const t = u - 1.5 / d1
    return n1 * t * t + 0.75
  }
  if (u < 2.5 / d1) {
    const t = u - 2.25 / d1
    return n1 * t * t + 0.9375
  }
  const t = u - 2.625 / d1
  return n1 * t * t + 0.984375
}

/** Damped sinusoidal decay — `A · e^(-λt) · sin(2πft + φ)`. Models
 *  things like door-slam shake, post-impact wobble. Returns the displacement
 *  signal (centred on 0) — caller picks blend mode (typically 'add'). */
export function decayOscillation(
  u: number,
  amplitude:  number,
  frequency:  number,
  damping:    number,
  phase:      number,
): number {
  if (u <= 0) return 0
  return amplitude * Math.exp(-damping * u) *
         Math.sin(2 * Math.PI * frequency * u + phase)
}
