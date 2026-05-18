// ── Parameter Wire Evaluator (BL-05) ──────────────────────────────────────────
// Expression-driven parameter wiring. Reads a source value, runs it through
// a whitelist-safe expression like "map(source, 0, 1, 0, 360)", writes the
// computed value to the override map.
//
// Parsing is cached per (wireId, expression) — the AST is reused while the
// expression text stays the same. Re-parsing happens automatically when a
// user edits the expression because the cache key includes the expression.
//
// Single-pass like evaluateBindings; loops are tolerated but not iterated.

import type { ParameterWire, Layer, ChronoScene, ParameterRef } from '../types'
import type { OverrideMap } from '../evaluator'
import type { ParamValueMap } from './paramResolver'
import { parseExpression, evaluateExpression } from '../core/expression/expressionEvaluator'
import type { ExpressionAST } from '../core/expression/expressionEvaluator'
import { paramRefKey } from '../wiring/helpers'

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
  astCache.set(wireId, entry)
  return entry
}

/** Clear the AST cache. Tests + scene reload should call this. */
export function clearParameterWireCache(): void {
  astCache.clear()
}

// ─────────────────────────────────────────────────────────────────────────────
// Source resolution — mirrors readSource() in bindingEvaluator
// ─────────────────────────────────────────────────────────────────────────────

function readWireSource(
  source: ParameterRef,
  overrides: OverrideMap,
  paramValues: ParamValueMap,
  layers: Layer[],
): number | null {
  // Scene parameter (no layerId)
  if (!source.layerId) {
    const v = paramValues.get(source.propertyPath)
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  // Layer property — try animated override first, fall back to static value
  const key = paramRefKey(source)
  const animated = overrides.get(key)
  if (animated !== undefined) return animated

  const layer = layers.find((l) => l.id === source.layerId)
  if (!layer) return null
  return readLayerProperty(layer, source.propertyPath)
}

function readLayerProperty(layer: Layer, property: string): number | null {
  let v: unknown = layer
  for (const seg of property.split('.')) {
    if (v == null || typeof v !== 'object') return null
    v = (v as Record<string, unknown>)[seg]
  }
  return typeof v === 'number' ? v : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

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
  if (!wires || wires.length === 0) return overrides
  let next = overrides
  let cloned = false

  for (const wire of wires) {
    if (!wire.enabled) continue

    const sourceVal = readWireSource(wire.source, overrides, paramValues, scene.layers)
    if (sourceVal == null) continue

    const cached = getOrParseAst(wire.id, wire.expression)
    if (!cached.ast) continue // bad expression — skip silently (UI shows the error)

    let result: number
    try {
      result = evaluateExpression(cached.ast, { source: sourceVal, s: sourceVal })
    } catch {
      continue // runtime error — skip; expression editor surfaces the issue
    }

    if (!Number.isFinite(result)) continue

    // Optional output clamp (BL-05 schema)
    if (wire.clamp?.enabled) {
      if (wire.clamp.min != null && result < wire.clamp.min) result = wire.clamp.min
      if (wire.clamp.max != null && result > wire.clamp.max) result = wire.clamp.max
    }

    if (!cloned) { next = new Map(overrides); cloned = true }
    next.set(paramRefKey(wire.target), result)
  }

  return next
}
