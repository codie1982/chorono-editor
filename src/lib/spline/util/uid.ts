// Lightweight unique-id generator for spline elements (no crypto dependency).
let _counter = 0

export function uid(prefix: string): string {
  return `${prefix}_${++_counter}_${Math.random().toString(36).slice(2, 6)}`
}

/** Operation-local allocator reserving imported/source IDs before adding new
 * geometry. Worker counters start in another realm, so uid alone cannot prove
 * absence from source. Returned IDs reserve themselves; no global source/cache
 * reference survives the operation. Existing uid format stays compatible. */
export function createSplineIdAllocator(reserved: readonly string[]): (prefix: string) => string {
  const used = new Set(reserved)
  return prefix => {
    let id = uid(prefix)
    while (used.has(id)) id = uid(prefix)
    used.add(id)
    return id
  }
}
