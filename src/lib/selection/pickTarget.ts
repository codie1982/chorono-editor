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

/** Body gestures retain the already selected subtree under a hit, including a
 * selected parent of a deeper painted child. Otherwise normal/deep pick policy
 * applies. This avoids promoting a selected child to an unrelated outer group
 * when Alt/Cmd is held before mouse-down. No parent or selection is mutated. */
export function canvasSelectionPickTarget(hitId: string | null, layers: LayerLookup,
  selectedIds: ReadonlySet<string>, deep = false): string | null {
  let current = hitId ? layers.get(hitId) : undefined
  const seen = new Set<string>()
  while (current) {
    if (seen.has(current.id)) return null
    seen.add(current.id)
    if (selectedIds.has(current.id)) return current.id
    current = current.parentId ? layers.get(current.parentId) : undefined
  }
  return canvasPickTarget(hitId, layers, deep)
}

/** Compatibility export for the original copy-only consumer. */
export { canvasSelectionPickTarget as canvasClonePickTarget }
