// ── SelectionManager (BL-60) ──────────────────────────────────────────────────
// State container + executor for the Smart Selection Engine. Holds a list of
// SelectionRules and runs queries against Layer arrays. Pure logic — no React,
// no DOM. UI panels create instances per-tab and read results back via
// executeQuery().
//
// Key principle (from the plan): page.tsx's selection state is UNCHANGED.
// SelectionManager produces SETS of matched layer ids that the panel hands
// to onSelect(ids) which routes back into the existing selectLayer() flow.

import type { Layer } from '../types'
import type {
  SelectionRule, SelectionQuery, SelectionQueryResult, CombineOp,
  NumericRule, StringRule,
} from './types'
import { readLayerAttr } from './types'
import {
  numberNear, inRange, stringEquals, stringContains,
  stringStartsWith, stringEndsWith,
} from './predicates'

export class SelectionManager {
  private rules: SelectionRule[] = []

  // ─────────────────────────────────────────────────────────────────────────
  // Rule CRUD
  // ─────────────────────────────────────────────────────────────────────────

  addRule(rule: SelectionRule): void {
    this.rules.push(rule)
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId)
  }

  updateRule(ruleId: string, patch: Partial<SelectionRule>): void {
    this.rules = this.rules.map((r) =>
      r.id === ruleId ? ({ ...r, ...patch } as SelectionRule) : r,
    )
  }

  getRules(): SelectionRule[] {
    return this.rules.slice()
  }

  clearRules(): void {
    this.rules = []
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Query execution
  // ─────────────────────────────────────────────────────────────────────────

  /** Evaluate a query against a layer array and return the matched ids. */
  executeQuery(query: SelectionQuery, layers: Layer[]): SelectionQueryResult {
    const enabled = query.rules.filter((r) => r.enabled)
    const layerIds = new Set<string>()
    for (const layer of layers) {
      if (matchesQuery(layer, { ...query, rules: enabled })) {
        layerIds.add(layer.id)
      }
    }
    return { layerIds, evaluatedAt: Date.now() }
  }

  /** Convenience: run the manager's own rules + a combineOp against layers. */
  executeOwn(combineOp: CombineOp, layers: Layer[]): SelectionQueryResult {
    return this.executeQuery({ rules: this.rules, combineOp }, layers)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure evaluator — exported for tests + direct use without an instance
// ─────────────────────────────────────────────────────────────────────────────

/** True if a layer satisfies a single rule. Disabled rules always return
 *  false — call sites filter them out before composing. */
export function evaluateRule(layer: Layer, rule: SelectionRule): boolean {
  if (!rule.enabled) return false
  return rule.kind === 'numeric'
    ? evaluateNumericRule(layer, rule)
    : evaluateStringRule(layer, rule)
}

function evaluateNumericRule(layer: Layer, rule: NumericRule): boolean {
  const raw = readLayerAttr(layer, rule.attr)
  if (typeof raw !== 'number') return false
  switch (rule.operator) {
    case 'equals':  return raw === rule.value
    case 'near':    return numberNear(raw, rule.value, rule.value2 ?? 0)
    case 'between': return inRange(raw, rule.value, rule.value2 ?? rule.value)
    case 'less':    return raw < rule.value
    case 'greater': return raw > rule.value
  }
}

function evaluateStringRule(layer: Layer, rule: StringRule): boolean {
  const raw = readLayerAttr(layer, rule.attr)
  if (typeof raw !== 'string') return false
  const ic = rule.ignoreCase ?? true
  switch (rule.operator) {
    case 'equals':     return stringEquals(raw, rule.value, ic)
    case 'contains':   return stringContains(raw, rule.value, ic)
    case 'startsWith': return stringStartsWith(raw, rule.value, ic)
    case 'endsWith':   return stringEndsWith(raw, rule.value, ic)
  }
}

/** Combine rule results across a query. */
export function matchesQuery(layer: Layer, query: SelectionQuery): boolean {
  const rules = query.rules
  if (rules.length === 0) return false
  switch (query.combineOp) {
    case 'AND': return rules.every((r) => evaluateRule(layer, r))
    case 'OR':  return rules.some((r) => evaluateRule(layer, r))
    case 'NOT': return !rules.some((r) => evaluateRule(layer, r))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ID factory — used by panel "+ Add Rule" buttons
// ─────────────────────────────────────────────────────────────────────────────

let ruleCounter = 0
export function nextRuleId(): string {
  ruleCounter++
  return `rule_${Date.now()}_${ruleCounter}`
}
