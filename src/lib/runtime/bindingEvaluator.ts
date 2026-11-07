// ── Binding Evaluator ─────────────────────────────────────────────────────────
// Motion-binding pipeline: read a source value (either an animated layer
// property already in the override map, or a runtime parameter) and write a
// remapped value into the override map for the target property.
//
// Single-pass to avoid feedback loops. Authoring "A drives B" + "B drives A"
// is allowed but only one update of each side is applied per frame.

import type { Binding, Layer, ChronoScene } from '../types'
import type { OverrideMap } from '../evaluator'
import type { ParamValueMap } from './paramResolver'

// ─────────────────────────────────────────────────────────────────────────────
// Linear remap
// ─────────────────────────────────────────────────────────────────────────────

export function remap(
  input: number,
  inMin: number, inMax: number,
  outMin: number, outMax: number,
  clamp: boolean,
  reverse: boolean,
): number {
  const range = inMax - inMin
  const t = range === 0 ? 0 : (input - inMin) / range
  const tt = reverse ? 1 - t : t
  let v = outMin + tt * (outMax - outMin)
  if (clamp) {
    const lo = Math.min(outMin, outMax)
    const hi = Math.max(outMin, outMax)
    if (v < lo) v = lo
    if (v > hi) v = hi
  }
  return v
}

// ─────────────────────────────────────────────────────────────────────────────
// Source / target resolution
// ─────────────────────────────────────────────────────────────────────────────

function readSource(
  binding: Binding,
  overrides: OverrideMap,
  paramValues: ParamValueMap,
  layers: Layer[],
): number | null {
  const src = binding.source
  switch (src.type) {
    case 'parameter': {
      if (!src.paramId) return null
      const v = paramValues.get(src.paramId)
      if (typeof v === 'number')  return v
      if (typeof v === 'boolean') return v ? 1 : 0
      if (typeof v === 'string') {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      return null
    }
    case 'layerProperty': {
      if (!src.layerId || !src.property) return null
      const key = `layers.${src.layerId}.${src.property}`
      const animated = overrides.get(key)
      if (animated !== undefined) return typeof animated === 'number' && Number.isFinite(animated) ? animated : null
      // Fall back to the layer's static value when no keyframe override exists.
      const layer = layers.find((l) => l.id === src.layerId)
      if (!layer) return null
      const literal = getLayerLiteral(layer, src.property)
      return typeof literal === 'number' ? literal : null
    }
  }
}

function getLayerLiteral(layer: Layer, property: string): unknown {
  // Cheap dot-path getter — only traverses plain objects.
  let v: unknown = layer
  for (const seg of property.split('.')) {
    if (v == null || typeof v !== 'object') return undefined
    v = (v as Record<string, unknown>)[seg]
  }
  return v
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply every Binding in `bindings` to the `overrides` map. Returns a new
 * Map when any binding wrote — otherwise the input map is returned to keep
 * downstream change detection cheap.
 */
export function evaluateBindings(
  bindings: Binding[],
  overrides: OverrideMap,
  paramValues: ParamValueMap,
  scene: Pick<ChronoScene, 'layers'>,
): OverrideMap {
  if (bindings.length === 0) return overrides
  let next = overrides
  let cloned = false

  for (const binding of bindings) {
    const sourceVal = readSource(binding, overrides, paramValues, scene.layers)
    if (sourceVal == null) continue

    const out = remap(
      sourceVal,
      binding.map.inputMin, binding.map.inputMax,
      binding.map.outputMin, binding.map.outputMax,
      binding.map.clamp  ?? true,
      binding.map.reverse ?? false,
    )

    const targetKey = resolveTargetKey(binding)
    if (!targetKey) continue

    if (!cloned) { next = new Map(overrides); cloned = true }
    next.set(targetKey, out)
  }

  return next
}

function resolveTargetKey(binding: Binding): string | null {
  const t = binding.target
  switch (t.type) {
    case 'layerProperty': {
      if (!t.layerId || !t.property) return null
      return `layers.${t.layerId}.${t.property}`
    }
    case 'timelineProgress': {
      if (!t.timelineId) return null
      // Special key consumed by the evaluator to override timeline local time.
      // The hook reads this and feeds it into segment-state-like overrides.
      return `timeline.${t.timelineId}.progress`
    }
    case 'parameter': {
      if (!t.paramId) return null
      // Parameter writes happen out-of-band via the runtime hook — flag here.
      return `params.${t.paramId}`
    }
  }
}
