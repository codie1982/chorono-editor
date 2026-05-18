// ── Smart Selection Engine — Types (BL-60) ────────────────────────────────────
// Data model for the queryable selection system. Mirrors 3ds Max's
// "Select Similar" + "Select By" plus After Effects layer filtering.
//
// Two query primitives:
//   - SelectionRule    → single condition (attribute / operator / value)
//   - SelectionQuery   → many rules + boolean combiner (AND / OR / NOT)
//
// Plus a typed list of attributes (number / string) so the rule builder can
// pick valid operators + render the right input.

import type { Layer } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Attribute catalog
// ─────────────────────────────────────────────────────────────────────────────

/** Numeric layer attributes the rule builder can query against. */
export type NumericAttr =
  | 'x' | 'y'
  | 'scaleX' | 'scaleY'
  | 'rotationDeg'
  | 'opacity'

/** String layer attributes. */
export type StringAttr = 'name' | 'type'

export type AttrName = NumericAttr | StringAttr

export type NumericOperator =
  | 'equals' | 'near' | 'between' | 'less' | 'greater'

export type StringOperator =
  | 'contains' | 'startsWith' | 'endsWith' | 'equals'

export type Operator = NumericOperator | StringOperator

// ─────────────────────────────────────────────────────────────────────────────
// Rule + query shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface NumericRule {
  id:        string
  enabled:   boolean
  kind:      'numeric'
  attr:      NumericAttr
  operator:  NumericOperator
  /** Primary comparison value. For 'between', this is the minimum. */
  value:     number
  /** Second value — used by 'between' (max) and 'near' (tolerance). */
  value2?:   number
}

export interface StringRule {
  id:        string
  enabled:   boolean
  kind:      'string'
  attr:      StringAttr
  operator:  StringOperator
  value:     string
  /** Case-insensitive comparison. Default true. */
  ignoreCase?: boolean
}

export type SelectionRule = NumericRule | StringRule

/** Combiner — how to merge results across multiple rules.
 *  AND: layer matches ONLY if every enabled rule passes.
 *  OR : layer matches if AT LEAST ONE enabled rule passes.
 *  NOT: layer matches if NO enabled rule passes (inverted AND, kept simple).
 */
export type CombineOp = 'AND' | 'OR' | 'NOT'

export interface SelectionQuery {
  rules:     SelectionRule[]
  combineOp: CombineOp
}

export interface SelectionQueryResult {
  layerIds:  Set<string>
  /** ms timestamp — handy for "stale result" checks if a panel caches. */
  evaluatedAt: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarity options ("Select Similar" tab)
// ─────────────────────────────────────────────────────────────────────────────

export interface SimilarityOptions {
  /** Match layers whose average scale is within `scaleTolerancePct` % of the
   *  reference. */
  matchScale: boolean
  scaleTolerancePct: number     // default 5
  /** Match layers whose rotation is within `rotationToleranceDeg` ° of the
   *  reference (wraparound-aware). */
  matchRotation: boolean
  rotationToleranceDeg: number  // default 5
  /** Match layers whose distance-from-canvas-edges is within `positionTolerancePx`
   *  of the reference. (Edge distance = shortest of left/right/top/bottom.) */
  matchPosition: boolean
  positionTolerancePx: number   // default 10
  /** Match layers whose `type` field equals the reference's. */
  matchType: boolean
  /** Match layers whose opacity is within `opacityTolerance` of the reference. */
  matchOpacity: boolean
  opacityTolerance: number      // default 0.05
}

export const DEFAULT_SIMILARITY: SimilarityOptions = {
  matchScale: true,    scaleTolerancePct: 5,
  matchRotation: true, rotationToleranceDeg: 5,
  matchPosition: false, positionTolerancePx: 10,
  matchType: true,
  matchOpacity: false, opacityTolerance: 0.05,
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer attribute reader — used by both predicates + rule evaluator
// ─────────────────────────────────────────────────────────────────────────────

/** Read a typed attribute from a Layer. Centralised so adding new attributes
 *  doesn't require touching multiple call sites. Returns undefined for
 *  attributes that don't apply to the layer (e.g. opacity on audio). */
export function readLayerAttr(layer: Layer, attr: AttrName): number | string | undefined {
  switch (attr) {
    case 'x':           return layer.transform.x
    case 'y':           return layer.transform.y
    case 'scaleX':      return layer.transform.scaleX
    case 'scaleY':      return layer.transform.scaleY
    case 'rotationDeg': return layer.transform.rotationDeg
    case 'opacity':     return layer.opacity
    case 'name':        return layer.name
    case 'type':        return layer.type
  }
}
