import type { ChronoScene } from '../../types'

/** Convert editable source to a borrowed runtime source view without the root
 * authoring ledger. Source is not mutated/cloned deeply; IDs/values and user
 * animation parameters named authoring/hermes remain unchanged. Both runtime
 * exporter adapters call this explicitly, independent of their field allowlists.
 */
export function withoutAuthoring(scene: ChronoScene): ChronoScene {
  const { authoring: _editorOnly, ...runtime } = scene
  return runtime
}
