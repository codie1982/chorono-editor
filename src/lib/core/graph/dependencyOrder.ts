/** Deterministic iterative Kahn plan for directed dependencies. Nodes/edges are
 * borrowed; duplicate edges retain their matching indegree contribution. Order
 * follows first insertion among ready nodes. Blocked includes cycles and every
 * downstream dependent. O(V+E), no recursion, mutation or retained global state. */
export function dependencyOrder(nodes: Iterable<string>, edges: Iterable<readonly [string, string]>): { order: string[]; blocked: ReadonlySet<string> } {
  const degree = new Map<string, number>(), outgoing = new Map<string, string[]>()
  for (const node of Array.from(nodes)) degree.set(node, 0)
  for (const [source, target] of Array.from(edges)) {
    const next = outgoing.get(source) ?? []; next.push(target); outgoing.set(source, next)
    if (!degree.has(source)) degree.set(source, 0)
    degree.set(target, (degree.get(target) ?? 0) + 1)
  }
  const order = Array.from(degree).filter(([, count]) => !count).map(([key]) => key)
  for (let i = 0; i < order.length; i++) for (const target of outgoing.get(order[i]) ?? []) {
    const remaining = degree.get(target)! - 1; degree.set(target, remaining)
    if (!remaining) order.push(target)
  }
  return { order, blocked: new Set(Array.from(degree).filter(([, count]) => count > 0).map(([key]) => key)) }
}
