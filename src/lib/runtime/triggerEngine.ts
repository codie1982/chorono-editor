// ── Trigger Engine ────────────────────────────────────────────────────────────
// Given a list of authored Triggers and a list of events that fired this
// frame, return the actions whose conditions matched. Pure — no side effects,
// no I/O. The hook is responsible for actually applying the actions.

import type {
  Trigger, TriggerEvent, TriggerEventType, TriggerCondition, TriggerAction,
} from '../types'
import type { ParamValueMap } from './paramResolver'

export interface RuntimeEvent {
  type:         TriggerEventType
  layerId?:     string
  segmentId?:   string
  timelineId?:  string
  refId?:       string
  frameNumber?: number
  /** 0–1 normalized drag distance, used for dragMove. */
  progress?:    number
  /** Raw horizontal drag delta in composition pixels (dragMove). */
  dx?:          number
  /** Raw vertical drag delta in composition pixels (dragMove). */
  dy?:          number
}

export type ResolvedAction = TriggerAction & {
  triggerId: string
  /** The event that fired this action — provides dx/dy/progress payload for
   *  paramValueFrom resolution downstream. */
  sourceEvent: RuntimeEvent
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────────

function eventMatches(triggerEvent: TriggerEvent, runtime: RuntimeEvent): boolean {
  if (triggerEvent.type !== runtime.type) return false
  // For each optional discriminator on the authored trigger, when present it
  // must equal the runtime event's value. When absent, any value matches.
  if (triggerEvent.layerId    && triggerEvent.layerId    !== runtime.layerId)    return false
  if (triggerEvent.segmentId  && triggerEvent.segmentId  !== runtime.segmentId)  return false
  if (triggerEvent.timelineId && triggerEvent.timelineId !== runtime.timelineId) return false
  if (triggerEvent.refId      && triggerEvent.refId      !== runtime.refId)      return false
  if (triggerEvent.frameNumber != null
      && triggerEvent.frameNumber !== runtime.frameNumber) return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate an optional TriggerCondition against the current parameter values.
 * Path format: "params.<paramId>". Unknown paths evaluate to false so a
 * mistyped trigger never silently fires.
 */
export function evaluateCondition(
  condition: TriggerCondition,
  paramValues: ParamValueMap,
): boolean {
  const value = lookupConditionPath(condition.path, paramValues)
  if (value === undefined) return false
  switch (condition.op) {
    case 'eq':  return value === condition.value
    case 'neq': return value !== condition.value
    case 'gt':  return numCompare(value, condition.value) > 0
    case 'lt':  return numCompare(value, condition.value) < 0
    case 'gte': return numCompare(value, condition.value) >= 0
    case 'lte': return numCompare(value, condition.value) <= 0
  }
}

function lookupConditionPath(path: string, paramValues: ParamValueMap): unknown {
  // V1 supports only `params.<id>`. Future: add `layers.<id>.<prop>` lookups.
  const m = /^params\.(.+)$/.exec(path)
  if (!m) return undefined
  return paramValues.get(m[1])
}

function numCompare(a: unknown, b: unknown): number {
  const an = typeof a === 'number' ? a : Number(a)
  const bn = typeof b === 'number' ? b : Number(b)
  if (!Number.isFinite(an) || !Number.isFinite(bn)) return 0
  return an - bn
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For each event, walk all triggers and return the actions whose event +
 * condition matched. Result preserves trigger declaration order.
 */
export function evaluateTriggers(
  triggers: Trigger[],
  events: RuntimeEvent[],
  paramValues: ParamValueMap,
): ResolvedAction[] {
  if (events.length === 0 || triggers.length === 0) return []
  const out: ResolvedAction[] = []
  for (const runtimeEvent of events) {
    for (const trigger of triggers) {
      if (!eventMatches(trigger.event, runtimeEvent)) continue
      if (trigger.condition && !evaluateCondition(trigger.condition, paramValues)) continue
      for (const action of trigger.actions) {
        out.push({ ...action, triggerId: trigger.id, sourceEvent: runtimeEvent })
      }
    }
  }
  return out
}
