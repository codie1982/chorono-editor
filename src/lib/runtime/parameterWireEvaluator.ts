// ── Parameter Wire Evaluator (BL-05) ──────────────────────────────────────────
// Expression-driven parameter wiring. Reads a source value, runs it through
// a whitelist-safe expression like "map(source, 0, 1, 0, 360)", writes the
// computed value to the override map.
//
// Parsing is cached per (wireId, expression) — the AST is reused while the
// expression text stays the same. Re-parsing happens automatically when a
// user edits the expression because the cache key includes the expression.
//
// One immutable pre-wire input frame; no iterative feedback. Cyclic/dependent
// wires retain their input value with a diagnostic instead of arbitrary feedback.

import type { ParameterWire, ChronoScene } from '../types'
import type { OverrideMap } from '../evaluator'
import type { ParamValueMap } from './paramResolver'
import { parseExpression, evaluateExpression } from '../core/expression/expressionEvaluator'
import type { ExpressionAST } from '../core/expression/expressionEvaluator'
import { paramRefKey } from '../wiring/helpers'
import { readWireSource } from '../wiring/WireSource'
export { readWireSource } from '../wiring/WireSource'
import { blockedWireIds, clampWireValue } from '../wiring/WireValidation'

// ─────────────────────────────────────────────────────────────────────────────
// AST cache — survives re-render cycles via module-scope Map
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  expression: string
  ast: ExpressionAST | null
  /** Last error message, if parsing failed. */
  error: string | null
}

const astCache = new Map<string, CacheEntry>()

function getOrParseAst(wireId: string, expression: string): CacheEntry {
  const cached = astCache.get(wireId)
  if (cached && cached.expression === expression) return cached

  let ast: ExpressionAST | null = null
  let error: string | null = null
  try {
    ast = parseExpression(expression)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const entry: CacheEntry = { expression, ast, error }
  if (astCache.size >= 512 && !astCache.has(wireId)) astCache.delete(astCache.keys().next().value!)
  astCache.set(wireId, entry)
  return entry
}

/** Clear the AST cache. Tests + scene reload should call this. */
export function clearParameterWireCache(): void {
  astCache.clear()
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Augmented return value (BL-05 Sprint 6). Holds the override map plus the
 *  set of wire IDs whose source resolution failed during this frame — caller
 *  surfaces these as red "broken" badges in WiringListPanel / Properties / etc. */
export interface WireEvaluationResult {
  overrides:        OverrideMap
  brokenWireIds:    Set<string>
  /** Wires that parsed but threw at runtime (divide-by-zero, etc.). */
  runtimeErrorIds:  Set<string>
  /** Cyclic wires and dependencies on cycles retain their pre-wire fallback. */
  cycleWireIds: ReadonlySet<string>
  errors: ReadonlyMap<string, string>
}

/**
 * Apply every enabled ParameterWire to the override map. Returns a new Map
 * only when any wire wrote, otherwise the input map is preserved to keep
 * downstream change detection cheap (same convention as evaluateBindings).
 *
 * Wire's source is exposed inside the expression as both `source` (preferred,
 * matches the doc) and `s` (legacy shorthand) so existing wires keep working.
 */
export function evaluateParameterWires(
  wires: ParameterWire[] | undefined,
  overrides: OverrideMap,
  paramValues: ParamValueMap,
  scene: Pick<ChronoScene, 'layers'>,
): OverrideMap {
  return evaluateParameterWiresVerbose(wires, overrides, paramValues, scene).overrides
}

/** Verbose variant that ALSO reports which wires couldn't resolve their
 *  source (broken) or threw at runtime. Both sets are empty when wires is
 *  empty/undefined. Returns identity-stable `overrides` when no wire wrote. */
export function evaluateParameterWiresVerbose(
  wires: ParameterWire[] | undefined,
  overrides: OverrideMap,
  paramValues: ParamValueMap,
  scene: Pick<ChronoScene, 'layers'>,
): WireEvaluationResult {
  const brokenWireIds   = new Set<string>()
  const runtimeErrorIds = new Set<string>()
  const cycleWireIds = blockedWireIds(wires ?? []), errors = new Map<string, string>()
  if (!wires || wires.length === 0) {
    return { overrides, brokenWireIds, runtimeErrorIds, cycleWireIds, errors }
  }

  let next = overrides
  let cloned = false

  for (const wire of wires) {
    if (!wire.enabled) continue
    if (cycleWireIds.has(wire.id)) { errors.set(wire.id, 'Wire is cyclic or depends on a cycle; keeping the pre-wire value.'); continue }

    const sourceVal = readWireSource(wire.source, overrides, paramValues, scene.layers)
    if (sourceVal == null) {
      brokenWireIds.add(wire.id); errors.set(wire.id, 'Source has no finite numeric value; keeping the pre-wire value.')
      continue
    }

    const cached = getOrParseAst(wire.id, wire.expression)
    if (!cached.ast) {
      runtimeErrorIds.add(wire.id); errors.set(wire.id, cached.error ?? 'Invalid expression')
      continue
    }

    let result: number
    try {
      result = clampWireValue(evaluateExpression(cached.ast, { source: sourceVal, s: sourceVal }), wire.clamp)
    } catch (error) {
      errors.set(wire.id, error instanceof Error ? error.message : String(error))
      runtimeErrorIds.add(wire.id)
      continue
    }

    if (!Number.isFinite(result)) {
      runtimeErrorIds.add(wire.id)
      continue
    }


    if (!cloned) { next = new Map(overrides); cloned = true }
    next.set(paramRefKey(wire.target), result)
  }

  return { overrides: next, brokenWireIds, runtimeErrorIds, cycleWireIds, errors }
}
