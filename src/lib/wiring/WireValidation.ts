import type { ParameterWire } from '../types'
import { paramRefKey } from './helpers'
import { dependencyOrder } from '../core/graph/dependencyOrder'

/** Kahn pruning of enabled source→target dependencies. Remaining targets are
 * cyclic or downstream of a cycle and cannot safely produce a frame value.
 * Returns wire IDs, never mutates source. Multiple edges preserve indegrees;
 * O(wires + refs), iterative and bounded by the supplied scene. */
export function blockedWireIds(wires: readonly ParameterWire[]): ReadonlySet<string> {
  const enabled = wires.filter(wire => wire.enabled)
  const { blocked } = dependencyOrder([], enabled.map(wire => [paramRefKey(wire.source), paramRefKey(wire.target)] as const))
  return new Set(enabled.filter(wire => blocked.has(paramRefKey(wire.target))).map(wire => wire.id))
}

/** Shared finite numeric output clamp. Invalid limits are explicit failures,
 * not NaN overrides or silently reordered user bounds. Units follow target. */
export function clampWireValue(value: number, clamp: ParameterWire['clamp']): number {
  if (!Number.isFinite(value)) throw new Error('Expression result must be finite.')
  if (!clamp?.enabled) return value
  const { min, max } = clamp
  if (min !== undefined && !Number.isFinite(min) || max !== undefined && !Number.isFinite(max)
    || min !== undefined && max !== undefined && min > max) throw new Error('Clamp limits must be finite, with min ≤ max.')
  return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, value))
}
