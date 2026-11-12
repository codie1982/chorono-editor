import type { Layer } from '../../types'
import { canPlaceShape } from './shapePlacement'

/** Reserve an unused native-shape template against the current source IDs.
 * Registry counters are process-local and may restart below IDs loaded from a
 * project. Retry the original registry factory rather than renaming a layer:
 * this preserves its ID/name/default-geometry and global-counter semantics.
 *
 * `candidate` is already freshly created. `createNext` must return fresh native
 * shapes with distinct IDs; malformed/repeating factories throw without changing
 * source. The caller owns any counter side effects of that factory. This helper
 * neither mutates layers nor reserves IDs globally. Consumers recheck the current
 * scene for each allocation, including after a placement commit. With N occupied
 * IDs, at most N retries are needed from a distinct-ID factory. Lookup storage
 * and worst-case work are O(N); there are no browser or React dependencies.
 */
export function availableShapeTemplate(candidate: Layer, createNext: () => Layer,
  layers: readonly Pick<Layer, 'id'>[]): Layer {
  const occupied = new Set(layers.map(layer => layer.id)), attempted = new Set<string>()
  for (let count = 0; count <= occupied.size; count++) {
    if (!canPlaceShape(candidate)) throw new Error('The placement factory returned an unsupported shape.')
    if (!occupied.has(candidate.id)) return candidate
    if (attempted.has(candidate.id)) throw new Error('The placement factory repeated an occupied layer ID.')
    attempted.add(candidate.id)
    candidate = createNext()
  }
  throw new Error('The placement factory could not allocate an unused layer ID.')
}
