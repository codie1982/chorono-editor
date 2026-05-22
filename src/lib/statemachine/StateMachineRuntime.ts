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

export type SMRuntimeEventType =
  | 'stateChanged'      // the active state id changed
  | 'transitionFired'   // a transition was applied (carries the trigger)
  | 'blendStarted'      // a cross-fade between two state timelines began
  | 'definitionSynced'  // an updated definition was adopted

/** Observable lifecycle event — honors the script-event convention so the
 *  scripting console / host can react instead of polling currentStateId. */
export interface SMRuntimeEvent {
  type: SMRuntimeEventType
  /** stateChanged / transitionFired — previous and new state ids. */
  from?: string
  to?: string
  /** transitionFired — the triggering event, or null for guard-only. */
  event?: string | null
  /** blendStarted — the cross-fading timelines + duration. */
  fromTimelineId?: string
  toTimelineId?: string
  durationMs?: number
  /** definitionSynced — true when the live state was removed and we snapped. */
  snappedToInitial?: boolean
}

export class StateMachineRuntime {
  private _sm: StateMachineDefinition
  private _currentStateId: string
  private blend: BlendDescriptor | null = null

  constructor(
    sm: StateMachineDefinition,
    private onEvent?: (event: SMRuntimeEvent) => void,
  ) {
    this._sm = sm
    this._currentStateId = sm.initialStateId
  }

  get sm(): StateMachineDefinition { return this._sm }
  get currentStateId(): string { return this._currentStateId }

  /**
   * Adopt an updated definition (the editor produces a new object on every
   * edit). Preserves the live `currentStateId` when that state still exists;
   * otherwise snaps back to the new initial state. The blend is left intact —
   * an in-flight cross-fade survives an unrelated edit.
   */
  sync(def: StateMachineDefinition): void {
    this._sm = def
    const snapped = !def.states.some((s) => s.id === this._currentStateId)
    if (snapped) {
      const from = this._currentStateId
      this._currentStateId = def.initialStateId
      this.blend = null
      this.onEvent?.({ type: 'stateChanged', from, to: this._currentStateId })
    }
    this.onEvent?.({ type: 'definitionSynced', snappedToInitial: snapped })
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  get currentState(): ChronoSMState | undefined {
    return this._sm.states.find((s) => s.id === this._currentStateId)
  }

  /** Timeline that should play right now (the current state's timeline). */
  get activeTimelineId(): string | null {
    return this.currentState?.timelineId ?? null
  }

  /** True when `timelineId` backs any state of this machine. */
  ownsTimeline(timelineId: string): boolean {
    return this._sm.states.some((s) => s.timelineId === timelineId)
  }

  // ── Transitions ─────────────────────────────────────────────────────────────

  /**
   * Try to fire a transition for the given event. Returns the actions to run
   * (exit actions of the old state followed by entry actions of the new one),
   * or an empty array when nothing fires.
   */
  dispatch(event: string, getParam: ParamLookup, wallMs: number): SMAction[] {
    const t = resolveTransition(this._sm, this._currentStateId, event, getParam)
    return t ? this.applyTransition(t, wallMs, event) : []
  }

  /**
   * Check guard-only transitions (those without a trigger) and auto-fire the
   * winning one. Called every frame so parameter thresholds switch states with
   * no explicit event.
   */
  tickGuards(getParam: ParamLookup, wallMs: number): SMAction[] {
    const t = resolveTransition(this._sm, this._currentStateId, null, getParam)
    return t ? this.applyTransition(t, wallMs, null) : []
  }

  private applyTransition(t: BaseSMTransition, wallMs: number, event: string | null): SMAction[] {
    // Self-transition → no-op (prevents wildcard guard-only thrashing).
    if (t.to === this._currentStateId) return []
    const toState = this._sm.states.find((s) => s.id === t.to)
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

    const from = this._currentStateId
    this._currentStateId = t.to

    if (this.blend) {
      this.onEvent?.({
        type: 'blendStarted',
        fromTimelineId: this.blend.fromTimelineId,
        toTimelineId: this.blend.toTimelineId,
        durationMs: this.blend.durationMs,
      })
    }
    this.onEvent?.({ type: 'transitionFired', from, to: t.to, event })
    this.onEvent?.({ type: 'stateChanged', from, to: t.to })
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
    const from = this._currentStateId
    this._currentStateId = this._sm.initialStateId
    this.blend = null
    if (from !== this._currentStateId) {
      this.onEvent?.({ type: 'stateChanged', from, to: this._currentStateId })
    }
  }
}
