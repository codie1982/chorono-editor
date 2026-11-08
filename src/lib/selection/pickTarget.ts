import type { LayerLookup } from '../scene/LayerIndex'

/** Match hover and click group targeting. Plain picking promotes a hit to its
 * outermost ancestor group; deep picking retains the literal layer. A lookup
 * belongs to the displayed immutable scene. Malformed parent cycles return
 * null rather than hanging a pointer handler. No selection/source is mutated. */
export function canvasPickTarget(hitId: string | null, layers: LayerLookup, deep = false): string | null {
  if (!hitId || !layers.get(hitId)) return null
  if (deep) return hitId
  let target = hitId
  let current = layers.get(hitId)
  const seen = new Set<string>()
  while (current) {
    if (seen.has(current.id)) return null
    seen.add(current.id)
    if (current.type === 'group') target = current.id
    current = current.parentId ? layers.get(current.parentId) : undefined
  }
  return target
}
