import type { ChronoScene } from '../../types'
import { LayerIndex } from '../LayerIndex'

/** Editor-only visibility projection of complete source subtrees. Ancestors
 * remain as transform/compositing context. Authored hidden flags inside the
 * scope remain respected; visual solo is bypassed only in this borrowed view.
 * Source layers, animation, attribution and membership are never mutated.
 * Callers must pass the result only to display/hit-testing, never persistence,
 * export, editor command baselines or audio transport. Empty/deleted roots
 * return the original scene. Missing parents/cycles use LayerIndex's policy.
 */
export function projectIsolationView(scene: ChronoScene, rootIds: readonly string[]) {
  if (!rootIds.length) return { scene, scope: null, roots: [] as string[] }
  const index = new LayerIndex(scene.layers)
  const roots = Array.from(new Set(rootIds)).filter(id => index.get(id)?.type !== 'audio' && !!index.get(id))
  if (!roots.length) return { scene, scope: null, roots }
  const scope = index.subtreeIds(roots)
  index.ancestorIds(roots, false).forEach(id => scope.add(id))
  const layers = scene.layers.map(layer => {
    if (layer.type === 'audio') return layer
    const hidden = scope.has(layer.id) ? layer.hidden : true
    return hidden === layer.hidden && !layer.solo ? layer : { ...layer, hidden, solo: false }
  })
  return { scene: { ...scene, layers }, scope, roots }
}
