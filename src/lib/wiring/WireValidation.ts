import type { ParameterWire } from '../types'
import { paramRefKey } from './helpers'

/** Kahn pruning of enabled source→target dependencies. Remaining targets are
 * cyclic or downstream of a cycle and cannot safely produce a frame value.
 * Returns wire IDs, never mutates source. Multiple edges preserve indegrees;
 * O(wires + refs), iterative and bounded by the supplied scene. */
export function blockedWireIds(wires: readonly ParameterWire[]): ReadonlySet<string> {
  const edges = new Map<string, string[]>(), degree = new Map<string, number>()
  for (const wire of wires) {
    if (!wire.enabled) continue
    const a = paramRefKey(wire.source), b = paramRefKey(wire.target)
    const outgoing = edges.get(a) ?? []; outgoing.push(b); edges.set(a, outgoing)
    degree.set(a, degree.get(a) ?? 0); degree.set(b, (degree.get(b) ?? 0) + 1)
  }
  const queue = Array.from(degree).filter(([, count]) => !count).map(([key]) => key)
  for (let i = 0; i < queue.length; i++) for (const target of edges.get(queue[i]) ?? []) {
    const count = degree.get(target)! - 1; degree.set(target, count); if (!count) queue.push(target)
  }
  return new Set(wires.filter(wire => wire.enabled && degree.get(paramRefKey(wire.target))! > 0).map(wire => wire.id))
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
