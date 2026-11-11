import type { ChronoScene } from '../../types'

/** Borrow source fields and strip only asset runtime handles/decoded caches.
 * Stable IDs, authoring records, unknown serializable fields and source URLs
 * are preserved. The shallow view owns a new asset array; callers must not
 * mutate borrowed nested values. Blob portability belongs to the output/store.
 */
export function sceneSourceData(scene: ChronoScene): ChronoScene {
  return { ...scene, assets: scene.assets.map(({ runtime, ...source }) => { void runtime; return source }) }
}
