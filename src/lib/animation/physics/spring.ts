/** Spring solver (BL-49).
 *
 *  Stateful — secondary motion that "chases" a target value with mass +
 *  stiffness + damping. Same model used by React-Spring, Framer Motion,
 *  3ds Max Spring controller.
 *
 *  Equation:
 *      F = -k·(x - target) - c·v
 *      a = F / m
 *      v += a · dt
 *      x += v · dt
 *
 *  Cache: we keep one SpringState per (trackId, evaluatorId) outside the
 *  pure evaluator. The evaluator pure function takes a baseValue (== the
 *  target the spring is chasing) and returns the displaced value; the
 *  outer cache layer manages the time-stepping + reset-on-scrub.
 */

export interface SpringParams {
  /** Restoring force per unit displacement. Higher → stiffer (faster).
   *  Default 170 — matches React-Spring's 'default' preset. */
  stiffness: number
  /** Velocity damping. Higher → less oscillation. Default 26 → close to
   *  critical damping for stiffness 170 (~no overshoot). */
  damping:   number
  /** Pretend mass. Higher → more inertia, slower to start. Default 1. */
  mass:      number
}

export interface SpringState {
  value:    number
  velocity: number
}

export const DEFAULT_SPRING_PARAMS: SpringParams = {
  stiffness: 170,
  damping:   26,
  mass:      1,
}

/** Step the spring one tick toward target. Returns the new state.
 *  dtMs is clamped to 32 ms / 30 ms so a stalled frame can't slingshot
 *  the spring across the universe.
 */
export function stepSpring(
  state:  SpringState,
  target: number,
  dtMs:   number,
  params: SpringParams,
): SpringState {
  const dt = Math.min(0.032, Math.max(0, dtMs / 1000))
  if (dt === 0) return state
  const k = params.stiffness
  const c = params.damping
  const m = Math.max(0.001, params.mass)

  const displacement = state.value - target
  const springForce  = -k * displacement
  const dampingForce = -c * state.velocity
  const acceleration = (springForce + dampingForce) / m

  const velocity = state.velocity + acceleration * dt
  const value    = state.value    + velocity     * dt
  return { value, velocity }
}

/** "Catch up" the spring to (target, time) by integrating from a cached
 *  state at (prevValue, prevVelocity, prevTimeMs). Uses fixed sub-steps
 *  of 16 ms so the result is reproducible regardless of how big the time
 *  jump is. Used inside the evaluator wrapper when scrubbing forward. */
export function settleSpring(
  prev:    SpringState,
  target:  number,
  prevTimeMs: number,
  nowMs:   number,
  params:  SpringParams,
): SpringState {
  const SUB_DT_MS = 16
  let state = prev
  let t = prevTimeMs
  while (t + SUB_DT_MS <= nowMs) {
    state = stepSpring(state, target, SUB_DT_MS, params)
    t += SUB_DT_MS
  }
  const tail = nowMs - t
  if (tail > 0) state = stepSpring(state, target, tail, params)
  return state
}
