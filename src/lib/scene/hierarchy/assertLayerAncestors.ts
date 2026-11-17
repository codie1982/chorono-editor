import type { ChronoScene, Layer } from '../../types'

/** Reject missing/cyclic/deep parents rather than relying on renderer fallback. */
export function assertLayerAncestors(scene: ChronoScene, layer: Layer): void {
  const seen = new Set<string>()
  let current: Layer | undefined = layer
  while (current) {
    if (seen.has(current.id) || seen.size > 256) throw new Error('Repair the cyclic or excessively deep input hierarchy.')
    seen.add(current.id)
    if (!current.parentId) return
    current = scene.layers.find(item => item.id === current!.parentId)
    if (!current) throw new Error('A Boolean input parent is missing.')
  }
}
