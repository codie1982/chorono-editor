// ── State Machine — Base FSM types (BL-09) ───────────────────────────────────
// Platform-agnostic finite-state-machine core. These types carry NO Chrono
// 2D-editor specifics (no timelines, no layers) so they can be reused by a
// future game engine or any other consumer. Chrono-specific extensions live in
// `statemachine-chorono.ts`.
//
// Mental model: Rive State Machine / Unity Animator. A machine has states and
// transitions (edges). Transitions fire on an event and/or when a guard
// condition over runtime parameters becomes true.

/**
 * A node in the state machine. The base shape only knows its identity and the
 * side effects to run when it is entered/exited. What the state actually *plays*
 * (a 2D timeline, a 3D blend tree, …) is decided by the extending type.
 */
export interface BaseSMState {
  id: string
  name: string
  /** Side effects fired when this state becomes active. */
  entryActions?: SMAction[]
  /** Side effects fired when this state is left. */
  exitActions?: SMAction[]
}

/**
 * A directed edge between two states.
 *
 * `trigger` is OPTIONAL:
 *   - event-based : trigger set, guard empty   → fire when the event arrives
 *   - guard-only  : trigger empty, guard set   → fire as soon as the guard is
 *                                                 true (checked every frame)
 *   - hybrid      : both set                    → event arrives AND guard true
 *
 * NOTE on naming: this `trigger` (an SM event name like "hover") is unrelated
 * to `TriggerTrack.trigger` in `timeline/tracks.ts` (a timeline input region).
 * They are separate interfaces in separate files — no runtime overlap.
 */
export interface BaseSMTransition {
  id: string
  /** Source state id. `'*'` = wildcard: applies from ANY state. */
  from: string
  /** Destination state id. */
  to: string
  /** Event name that fires this transition. Empty → guard-only transition. */
  trigger?: string
  /** Condition over runtime parameters that must hold for the transition. */
  guard?: SMGuard
  /** Cross-fade duration when entering `to`. 0 / undefined = hard cut. */
  blendMs?: number
  /** Higher wins when multiple transitions are eligible at once. Default 0. */
  priority?: number
}

/** A single comparison over one runtime parameter. */
export interface SMGuard {
  param: string
  op: '>' | '<' | '==' | '!='
  value: number | string | boolean
}

/** A side effect run on state entry/exit. */
export interface SMAction {
  type: 'setParam' | 'emitEvent'
  /** For `setParam`: which parameter to write. */
  param?: string
  /** For `setParam`: the value to write. */
  value?: number | string | boolean
  /** For `emitEvent`: the event name to emit back into the machine/host. */
  event?: string
}
