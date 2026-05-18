/**
 * BL-57 — Faceted search evaluator
 *
 * Tests a layer against a parsed SearchQuery. All terms are AND-ed; a
 * negated term must NOT match for the layer to pass.
 *
 * Facet semantics:
 *   - type:<kind>          — case-insensitive match on Layer.type OR
 *                            Layer.shapeKind / Layer.shape (shape variants).
 *   - has:keyframes        — calls predicate.isAnimated
 *   - has:modifiers        — layer has effects, plugin effects, or effectsChain
 *   - has:constraints      — layer has followPath OR motionPath
 *   - has:masks            — layer.masks?.length > 0
 *   - is:locked|hidden|solo|pinned|frozen|animated  — boolean flag check
 *   - name:<substr>        — substring match on layer.name (case-insensitive)
 *   - color:<hex>          — exact match (case-insensitive) on colorLabel
 *   - parent:<id>          — Layer.parentId === id (case-insensitive)
 *   - <bare>               — substring on name OR type
 *
 * Unknown facet values fail safe (term doesn't match), but the term still
 * counts — keeps query results predictable.
 */

import type { Layer } from '@/lib/types'
import type { SearchQuery, SearchTerm } from './searchQuery'

export interface SearchPredicates {
  /** True if the layer has at least one keyframe in any timeline. */
  isAnimated?: (layer: Layer) => boolean
  /** True if the layer has masks or effects. */
  hasEffects?: (layer: Layer) => boolean
  /** True if the layer has followPath or motionPath bindings. */
  hasConstraints?: (layer: Layer) => boolean
}

/** Top-level predicate: does this layer satisfy the entire query? */
export function matchesQuery(
  layer:      Layer,
  query:      SearchQuery,
  predicates: SearchPredicates = {},
): boolean {
  if (query.isEmpty) return true
  for (const term of query.terms) {
    const hit = evaluateTerm(layer, term, predicates)
    // Negated term: must NOT match. Positive term: must match.
    if (term.negated ? hit : !hit) return false
  }
  return true
}

function evaluateTerm(
  layer:      Layer,
  term:       SearchTerm,
  predicates: SearchPredicates,
): boolean {
  if (!term.facet) {
    // Bare substring: name OR type.
    const v = term.value
    return layer.name.toLowerCase().includes(v) || layer.type.toLowerCase().includes(v)
  }

  switch (term.facet) {
    case 'type': {
      const v = term.value
      if (!v) return false
      const t = layer.type.toLowerCase()
      const k = (layer.shapeKind ?? layer.shape ?? '').toLowerCase()
      return t === v || k === v
    }

    case 'has': {
      switch (term.value) {
        case 'keyframes':   return predicates.isAnimated?.(layer)      ?? false
        case 'modifiers':   return predicates.hasEffects?.(layer)      ?? hasLocalEffects(layer)
        case 'constraints': return predicates.hasConstraints?.(layer)  ?? hasLocalConstraints(layer)
        case 'masks':       return (layer.masks?.length ?? 0) > 0
        default:            return false
      }
    }

    case 'is': {
      switch (term.value) {
        case 'locked':   return !!layer.locked
        case 'hidden':   return !!layer.hidden
        case 'solo':     return !!layer.solo
        case 'pinned':   return !!layer.pinned
        case 'frozen':   return !!layer.frozen
        case 'animated': return predicates.isAnimated?.(layer) ?? false
        default:         return false
      }
    }

    case 'name': {
      if (!term.value) return false
      return layer.name.toLowerCase().includes(term.value)
    }

    case 'color': {
      if (!term.value) return false
      return (layer.colorLabel ?? '').toLowerCase() === term.value
    }

    case 'parent': {
      if (!term.value) return false
      return (layer.parentId ?? '').toLowerCase() === term.value
    }
  }
}

// ── Local fallbacks ─────────────────────────────────────────────────────────
// When the panel doesn't provide a predicate (e.g. timeline not selected) we
// still try our best from the layer alone.

function hasLocalEffects(layer: Layer): boolean {
  if ((layer.effectsChain?.length ?? 0) > 0) return true
  if ((layer.masks?.length ?? 0) > 0) return true
  const fx = layer.effects
  // `effects` is an object of optional CSS-filter-style numbers; any
  // non-zero value means it has SOME effect applied.
  if (fx && Object.values(fx).some((v) => typeof v === 'number' && v !== 0)) return true
  return false
}

function hasLocalConstraints(layer: Layer): boolean {
  if (layer.followPath) return true
  if (layer.motionPath) return true
  return false
}
