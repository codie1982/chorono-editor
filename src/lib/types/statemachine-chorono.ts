// ── State Machine — Chrono 2D editor types (BL-09) ───────────────────────────
// Chrono-specific extension of the platform-agnostic FSM core. Here a state is
// backed by a `Timeline` from `ChronoScene.timelines[]`: when the state is
// active, that timeline plays. A future game engine would write its own
// extension (e.g. GameSMState with a blendTreeId) instead of this file.

import type { BaseSMState, BaseSMTransition } from './statemachine-base'

/**
 * A Chrono state plays one timeline while active.
 * `timelineId` references `ChronoScene.timelines[].id`.
 */
export interface ChronoSMState extends BaseSMState {
  /** Which timeline plays while this state is active. */
  timelineId: string
  /** Playback rate multiplier for this state's timeline. Default 1. */
  speed?: number
}

/**
 * A complete state machine attached to a scene. Drives which timeline is the
 * active playhead and how transitions blend between them.
 */
export interface StateMachineDefinition {
  id: string
  name: string
  /** State that is active when the machine starts. */
  initialStateId: string
  states: ChronoSMState[]
  transitions: BaseSMTransition[]
}
