// ── StateMachineRuntime (BL-09) ─────────────────────────────────────────────
// Stateful driver for one StateMachineDefinition. Plain class (no React) so it
// is unit-testable in isolation and reusable by any host. It tracks the current
// state, runs transitions (event-driven and guard-only), collects entry/exit
// actions, and exposes the active timeline + an in-flight blend descriptor.
//
// The host (useSMRuntime) feeds it events + a parameter lookup + wall-clock
// time, and reads back `activeTimelineId` / `getBlend()` to evaluate timelines.

import type {
  StateMachineDefinition, ChronoSMState, BaseSMTransition, SMAction,
} from '../types'
import { resolveTransition } from './resolver'
import type { ParamLookup } from './guard'

/** Active cross-fade between two state timelines. */
interface BlendDescriptor {
  fromTimelineId: string
  toTimelineId: string
  startWallMs: number
  durationMs: number
}

/** Public blend snapshot for a given wall time. */
export interface ActiveBlend {
  fromTimelineId: string
  toTimelineId: string
  /** 0 → fully from, 1 → fully to. */
  alpha: number
}

export class StateMachineRuntime {
  sm: StateMachineDefinition
  currentStateId: string
  private blend: BlendDescriptor | null = null

  constructor(sm: StateMachineDefinition) {
    this.sm = sm
    this.currentStateId = sm.initialStateId
  }

  /**
   * Adopt an updated definition (the editor produces a new object on every
   * edit). Preserves the live `currentStateId` when that state still exists;
   * otherwise snaps back to the new initial state. The blend is left intact —
   * an in-flight cross-fade survives an unrelated edit.
   */
  sync(def: StateMachineDefinition): void {
    this.sm = def
    if (!def.states.some((s) => s.id === this.currentStateId)) {
      this.currentStateId = def.initialStateId
      this.blend = null
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  get currentState(): ChronoSMState | undefined {
    return this.sm.states.find((s) => s.id === this.currentStateId)
  }

  /** Timeline that should play right now (the current state's timeline). */
  get activeTimelineId(): string | null {
    return this.currentState?.timelineId ?? null
  }

  /** True when `timelineId` backs any state of this machine. */
  ownsTimeline(timelineId: string): boolean {
    return this.sm.states.some((s) => s.timelineId === timelineId)
  }

  // ── Transitions ─────────────────────────────────────────────────────────────

  /**
   * Try to fire a transition for the given event. Returns the actions to run
   * (exit actions of the old state followed by entry actions of the new one),
   * or an empty array when nothing fires.
   */
  dispatch(event: string, getParam: ParamLookup, wallMs: number): SMAction[] {
    const t = resolveTransition(this.sm, this.currentStateId, event, getParam)
    return t ? this.applyTransition(t, wallMs) : []
  }

  /**
   * Check guard-only transitions (those without a trigger) and auto-fire the
   * winning one. Called every frame so parameter thresholds switch states with
   * no explicit event.
   */
  tickGuards(getParam: ParamLookup, wallMs: number): SMAction[] {
    const t = resolveTransition(this.sm, this.currentStateId, null, getParam)
    return t ? this.applyTransition(t, wallMs) : []
  }

  private applyTransition(t: BaseSMTransition, wallMs: number): SMAction[] {
    // Self-transition → no-op (prevents wildcard guard-only thrashing).
    if (t.to === this.currentStateId) return []
    const toState = this.sm.states.find((s) => s.id === t.to)
    if (!toState) return []

    const fromState = this.currentState
    const actions: SMAction[] = []
    if (fromState?.exitActions) actions.push(...fromState.exitActions)
    if (toState.entryActions)   actions.push(...toState.entryActions)

    const fromTimelineId = fromState?.timelineId
    const blendMs = t.blendMs ?? 0
    this.blend = (fromTimelineId && blendMs > 0)
      ? { fromTimelineId, toTimelineId: toState.timelineId, startWallMs: wallMs, durationMs: blendMs }
      : null

    this.currentStateId = t.to
    return actions
  }

  // ── Blend ─────────────────────────────────────────────────────────────────

  /**
   * The in-flight blend for `wallMs`, or null when not blending. Self-clears
   * once the blend duration elapses so the host falls back to playing only the
   * active timeline.
   */
  getBlend(wallMs: number): ActiveBlend | null {
    if (!this.blend) return null
    const elapsed = wallMs - this.blend.startWallMs
    if (elapsed >= this.blend.durationMs) {
      this.blend = null
      return null
    }
    const alpha = this.blend.durationMs > 0 ? elapsed / this.blend.durationMs : 1
    return {
      fromTimelineId: this.blend.fromTimelineId,
      toTimelineId: this.blend.toTimelineId,
      alpha,
    }
  }

  /**
   * Non-mutating blend snapshot for UI display — unlike getBlend() it never
   * clears the blend, so the editor can read progress without interfering with
   * the runtime's own frame ticking.
   */
  peekBlend(wallMs: number): ActiveBlend | null {
    if (!this.blend) return null
    const elapsed = wallMs - this.blend.startWallMs
    if (elapsed >= this.blend.durationMs) return null
    const alpha = this.blend.durationMs > 0 ? elapsed / this.blend.durationMs : 1
    return {
      fromTimelineId: this.blend.fromTimelineId,
      toTimelineId: this.blend.toTimelineId,
      alpha,
    }
  }

  /** Reset to the initial state and clear any blend. */
  reset(): void {
    this.currentStateId = this.sm.initialStateId
    this.blend = null
  }
}
