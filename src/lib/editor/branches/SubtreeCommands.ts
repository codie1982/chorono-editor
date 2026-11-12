import type { ChronoScene } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import { LayerIndex } from '../../scene/LayerIndex'
import { makeBulkToggleFlagCmd } from '../commands-layer'

export type SubtreeFlag = 'hidden' | 'locked' | 'solo' | 'frozen'

/** Resolve complete selected forests against committed source. One existing
 * flag command changes only differing values and preserves mixed prior flags
 * through the editor's history. Overlapping roots are deduplicated; filtering,
 * collapse, timeline membership and virtualization never reduce the scope.
 * Flag operations intentionally remain available to unlock/unfreeze objects.
 * Returns null for no actual change; no geometry, keys or parent IDs are changed.
 */
export function makeSetSubtreeFlagCmd(scene: ChronoScene, roots: readonly string[], flag: SubtreeFlag, value: boolean): EditorCommand | null {
  const index = new LayerIndex(scene.layers)
  const changed = Array.from(index.subtreeIds(roots)).filter(id => !!index.get(id)?.[flag] !== value)
  return changed.length ? makeBulkToggleFlagCmd(changed, flag, value) : null
}
