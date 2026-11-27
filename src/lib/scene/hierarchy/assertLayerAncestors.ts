import type { ChronoScene, Layer } from '../../types'

/** Reject missing/cyclic/deep parents rather than relying on renderer fallback.
 * Native authoring may additionally require an editable complete chain. Default
 * validation/render queries still accept hidden/locked source hierarchies. */
export function assertLayerAncestors(scene: ChronoScene, layer: Layer, options: { editable?: boolean } = {}): void {
  const seen = new Set<string>()
  let current: Layer | undefined = layer
  while (current) {
    if (seen.has(current.id) || seen.size > 256) throw new Error('Repair the cyclic or excessively deep input hierarchy.')
    seen.add(current.id)
    if (options.editable && (current.locked || current.hidden || current.frozen || current.instanceOf)) throw new Error('Unlock/show the layer and its parents before editing the Boolean operation.')
    if (!current.parentId) return
    current = scene.layers.find(item => item.id === current!.parentId)
    if (!current) throw new Error('A Boolean input parent is missing.')
  }
}
