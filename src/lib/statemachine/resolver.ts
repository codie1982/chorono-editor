// ── SM Transition Resolver (BL-09) ──────────────────────────────────────────
// Given the machine's current state plus an incoming event (or a guard-only
// tick), pick the single transition that should fire. Pure — no mutation.
//
// Matching rules:
//   • `from` must equal the current state id OR be the wildcard '*'
//   • event-based call (event != null): transition.trigger must equal the event
//   • guard-only tick   (event == null): only transitions WITHOUT a trigger
//   • a present guard must evaluate true
//   • among eligible transitions, highest `priority` wins (ties → first declared)

import type { StateMachineDefinition, BaseSMTransition } from '../types'
import { evaluateGuard, type ParamLookup } from './guard'

export function resolveTransition(
  sm: StateMachineDefinition,
  currentStateId: string,
  event: string | null,
  getParam: ParamLookup,
): BaseSMTransition | null {
  const eligible = sm.transitions.filter((t) => {
    if (t.from !== currentStateId && t.from !== '*') return false

    if (event !== null) {
      // Event-driven: the transition must listen for this exact event.
      if (t.trigger !== event) return false
    } else {
      // Guard-only tick: skip anything waiting on an event AND require a guard.
      // A transition with neither a trigger nor a guard is "unconfigured" — it
      // must stay inert rather than auto-firing every frame (otherwise a freshly
      // drawn drag-to-connect edge would immediately advance the state).
      if (t.trigger) return false
      if (!t.guard) return false
    }

    if (t.guard && !evaluateGuard(t.guard, getParam)) return false
    return true
  })

  if (eligible.length === 0) return null
  if (eligible.length === 1) return eligible[0]

  // Stable sort by descending priority; declaration order breaks ties.
  let best = eligible[0]
  for (let i = 1; i < eligible.length; i++) {
    if ((eligible[i].priority ?? 0) > (best.priority ?? 0)) best = eligible[i]
  }
  return best
}
