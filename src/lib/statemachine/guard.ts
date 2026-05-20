// ── SM Guard Evaluator (BL-09) ──────────────────────────────────────────────
// A guard is a single comparison over one runtime parameter. The evaluator is
// pure: it reads the current value via a lookup and applies the operator.

import type { SMGuard } from '../types'
import type { RuntimeValue } from '../runtime/params/ParameterStore'

/** Reads the current value of a runtime parameter by name. */
export type ParamLookup = (name: string) => RuntimeValue | undefined

/** Numeric coercion helper — non-numeric strings become NaN (compare false). */
function num(v: RuntimeValue): number {
  return typeof v === 'number' ? v : Number(v)
}

/** Loose equality: numeric when either side is a number, else strict. */
function looseEq(a: RuntimeValue, b: RuntimeValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') return num(a) === num(b)
  return a === b
}

/**
 * Evaluate a guard against the current parameter values.
 * Returns false when the parameter is unset (a guard can never pass on a
 * missing input — keeps behaviour deterministic).
 */
export function evaluateGuard(guard: SMGuard, getParam: ParamLookup): boolean {
  const actual = getParam(guard.param)
  if (actual === undefined) return false
  switch (guard.op) {
    case '>':  return num(actual) >  num(guard.value)
    case '<':  return num(actual) <  num(guard.value)
    case '==': return looseEq(actual, guard.value)
    case '!=': return !looseEq(actual, guard.value)
    default:   return false
  }
}
