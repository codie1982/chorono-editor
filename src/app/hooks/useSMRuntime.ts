'use client'
// ── useSMRuntime (BL-09) ─────────────────────────────────────────────────────
// React owner for the scene's state machines. Holds one StateMachineRuntime
// instance per StateMachineDefinition (persisted across renders in a ref so the
// live currentState survives editor re-renders), and exposes:
//
//   • dispatchSMEvent(event, smId?) — queue an event (from UI test mode, the
//     SDK bridge, or a forwarded customEvent). Broadcast when smId omitted.
//   • tickFrame(globalTimeMs, getParam, wallMs) — drain the event queue, run
//     guard-only auto-transitions, and return the blended OverrideMap the SMs
//     contribute this frame, the timelines they own, and any entry/exit actions.
//
// When the scene has no state machines this hook is inert (tickFrame returns an
// empty map), so callers incur zero behavioural change.

import { useCallback, useRef } from 'react'
import type { ChronoScene, SMAction } from '@/lib/types'
import { evaluateTimelines, mergeOverrides, type OverrideMap } from '@/lib/evaluator'
import {
  StateMachineRuntime, blendOverrides, type ParamLookup,
} from '@/lib/statemachine'

export interface SMFrameResult {
  /** Blended override contribution from all active state machines. */
  overrides: OverrideMap
  /** Timeline ids backed by SM states — the host excludes these from its
   *  "evaluate every timeline" base so they aren't double-played. */
  ownedTimelineIds: Set<string>
  /** Entry/exit actions fired this frame (host applies setParam / emitEvent). */
  actions: SMAction[]
}

interface QueuedEvent { smId?: string; event: string }

export interface SMRuntimeReturn {
  hasSM: boolean
  dispatchSMEvent: (event: string, smId?: string) => void
  tickFrame: (globalTimeMs: number, getParam: ParamLookup, wallMs: number) => SMFrameResult
  /** Live runtime instances keyed by SM id — for UI introspection / tests. */
  runtimes: Map<string, StateMachineRuntime>
}

const EMPTY: SMFrameResult = {
  overrides: new Map(),
  ownedTimelineIds: new Set(),
  actions: [],
}

/** Own live machines for immutable editor definitions. Reconcile membership on
 * renders, but sync only a replaced definition: same-input playback ticks must
 * not rescan states or emit a spurious definitionSynced event. Timeline edits
 * still reach tickFrame through its scene dependency; active state is retained. */
export function useSMRuntime(scene: ChronoScene): SMRuntimeReturn {
  const runtimesRef = useRef<Map<string, StateMachineRuntime>>(new Map())
  const eventQueueRef = useRef<QueuedEvent[]>([])

  // ── Reconcile runtime instances with the current definitions ──────────────
  // Mutating a ref during render is safe (not React state) and keeps the live
  // currentState across edits while picking up structural changes.
  const machines = scene.stateMachines ?? []
  {
    const rts = runtimesRef.current
    const seen = new Set<string>()
    for (const def of machines) {
      seen.add(def.id)
      const existing = rts.get(def.id)
      if (existing) { if (existing.sm !== def) existing.sync(def) }
      else rts.set(def.id, new StateMachineRuntime(def))
    }
    for (const id of Array.from(rts.keys())) {
      if (!seen.has(id)) rts.delete(id)
    }
  }

  const dispatchSMEvent = useCallback((event: string, smId?: string) => {
    eventQueueRef.current.push({ smId, event })
  }, [])

  const tickFrame = useCallback(
    (globalTimeMs: number, getParam: ParamLookup, wallMs: number): SMFrameResult => {
      const rts = runtimesRef.current
      if (rts.size === 0) {
        eventQueueRef.current.length = 0
        return EMPTY
      }

      const owned = new Set<string>()
      const actions: SMAction[] = []
      const contributions: OverrideMap[] = []
      const pending = eventQueueRef.current.splice(0)

      rts.forEach((rt) => {
        rt.sm.states.forEach((s) => owned.add(s.timelineId))

        // Event-driven transitions (broadcast or targeted).
        for (const e of pending) {
          if (e.smId && e.smId !== rt.sm.id) continue
          const fired = rt.dispatch(e.event, getParam, wallMs)
          if (fired.length) actions.push(...fired)
        }
        // Guard-only auto transitions.
        const auto = rt.tickGuards(getParam, wallMs)
        if (auto.length) actions.push(...auto)

        // Override contribution: blended pair during a transition, else the
        // single active-state timeline.
        const blend = rt.getBlend(wallMs)
        if (blend) {
          const fromTl = scene.timelines.find((t) => t.id === blend.fromTimelineId)
          const toTl   = scene.timelines.find((t) => t.id === blend.toTimelineId)
          const fromOv = fromTl ? evaluateTimelines([fromTl], globalTimeMs) : new Map<string, number>()
          const toOv   = toTl   ? evaluateTimelines([toTl],   globalTimeMs) : new Map<string, number>()
          contributions.push(blendOverrides(fromOv, toOv, blend.alpha))
        } else if (rt.activeTimelineId) {
          const tl = scene.timelines.find((t) => t.id === rt.activeTimelineId)
          if (tl) contributions.push(evaluateTimelines([tl], globalTimeMs))
        }
      })

      const overrides = contributions.length
        ? mergeOverrides(...contributions)
        : new Map<string, number>()
      return { overrides, ownedTimelineIds: owned, actions }
    },
    [scene],
  )

  return {
    hasSM: machines.length > 0,
    dispatchSMEvent,
    tickFrame,
    runtimes: runtimesRef.current,
  }
}
