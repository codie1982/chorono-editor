// ── Parameter Resolver ────────────────────────────────────────────────────────
// Bridges the SceneParameter system to the evaluator pipeline.
//
//  1. `buildParamValues` merges defaults with runtime overrides.
//  2. `resolveTextContent` substitutes "{paramId}" placeholders in text strings.
//  3. `applyParamBindingsToOverrides` reads layer.paramBindings and writes the
//     resulting numeric overrides into the OverrideMap consumed by renderer.

import type {
  SceneParameter, SceneParameterValue,
  Layer,
} from '../types'
import type { OverrideMap } from '../evaluator'

export type ParamValueMap = Map<string, SceneParameterValue>

// ─────────────────────────────────────────────────────────────────────────────
// Defaults + overrides
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compose the effective value map: start from each parameter's defaultValue,
 * then apply any overrides supplied by the host (preview slider, Android
 * setParam, etc.). Returns a fresh Map each call.
 */
export function buildParamValues(
  params: SceneParameter[],
  overrides: ParamValueMap,
): ParamValueMap {
  const result: ParamValueMap = new Map()
  for (const param of params) {
    const override = overrides.get(param.id)
    result.set(param.id, override !== undefined ? override : param.defaultValue)
  }
  // Allow unknown override keys to pass through (e.g. for runtime debugging).
  overrides.forEach((v, k) => {
    if (!result.has(k)) result.set(k, v)
  })
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Text placeholder resolution
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /\{([^{}]+)\}/g

/**
 * Replace every `{paramId}` token in `template` with the matching parameter
 * value (coerced to string). Unknown tokens are left untouched so author
 * intent ("braces in copy") survives.
 */
export function resolveTextContent(
  template: string,
  values: ParamValueMap,
): string {
  if (!template || template.indexOf('{') < 0) return template
  return template.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const v = values.get(key.trim())
    if (v === undefined) return whole
    return String(v)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer.paramBindings → OverrideMap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For every layer with a `paramBindings` record, look up the bound parameter
 * value and write a numeric override at `layers.<layerId>.<property>`.
 *
 * Only numeric parameters (number, boolean→0/1) produce overrides. String and
 * colour parameters are consumed by the renderer directly (see
 * `getColorParamBinding`).
 *
 * Bindings authored against properties that already have an animated value
 * win — paramBindings override the keyframe baseline. This matches the
 * "param as runtime override" mental model.
 */
export function applyParamBindingsToOverrides(
  layers: Layer[],
  values: ParamValueMap,
  base: OverrideMap,
): OverrideMap {
  let result = base
  let cloned = false
  for (const layer of layers) {
    const bindings = layer.paramBindings
    if (!bindings) continue
    for (const property in bindings) {
      const paramId = bindings[property]
      const value = values.get(paramId)
      if (value === undefined) continue
      const numeric = coerceToNumber(value)
      if (numeric === null) continue
      if (!cloned) { result = new Map(base); cloned = true }
      result.set(`layers.${layer.id}.${property}`, numeric)
    }
  }
  return result
}

/**
 * Look up the value of a string / colour parameter bound to a given layer
 * property. Returns undefined when no binding exists. Used by the renderer
 * to override fill colours and text content without going through the
 * numeric override map.
 */
export function getStringParamBinding(
  layer: Layer,
  property: string,
  values: ParamValueMap,
): string | undefined {
  const paramId = layer.paramBindings?.[property]
  if (!paramId) return undefined
  const v = values.get(paramId)
  if (v === undefined) return undefined
  return String(v)
}

function coerceToNumber(v: SceneParameterValue): number | null {
  if (typeof v === 'number')  return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
