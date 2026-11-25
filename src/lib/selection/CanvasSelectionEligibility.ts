import type { Layer } from '../types'
import type { OverrideMap } from '../evaluator'
import { LayerIndex } from '../scene/LayerIndex'
import { editorSoloScope } from '../scene/visibility/editorSoloScope'
import { layerDrawActive } from '../render/visibility/LayerDrawVisibility'

/** Frame-local selection policy shared by body picking and all region styles.
 * Hidden, locked, frozen, fully transparent, time-inactive and non-solo branches
 * are not viewport targets; ancestor restrictions apply to descendants. Audio,
 * orphan chains and cycles are excluded. Layer-list inspection stays independent.
 * Reuses LayerIndex, inclusive layerDrawActive and the editor's solo subtree
 * policy. Mutable memoization is owned by this short-lived query instance only;
 * source/overrides are borrowed and never changed. O(n) construction and total
 * cached ancestry work; no DOM, renderer handles, global cache or history.
 */
export class CanvasSelectionEligibility {
  private readonly index: LayerIndex
  private readonly scope: ReadonlySet<string> | null
  private readonly memo = new Map<string, boolean>()

  constructor(layers: readonly Layer[], private readonly timeMs: number, private readonly overrides: OverrideMap = new Map()) {
    this.index = new LayerIndex(layers)
    this.scope = editorSoloScope(layers.map(layer => {
      const solo = overrides.get(`layers.${layer.id}.solo`)
      return typeof solo === 'boolean' && solo !== layer.solo ? { ...layer, solo } : layer
    }), true)
  }

  /** Answer for this displayed layer and all its ancestors. Results remain
   * valid only for the constructor's immutable source/frame snapshot. */
  accepts(layer: Layer): boolean {
    const cached = this.memo.get(layer.id)
    if (cached !== undefined) return cached
    const path: string[] = [], seen = new Set<string>()
    let current: Layer | undefined = layer, allowed = true
    while (current) {
      const known = this.memo.get(current.id)
      if (known !== undefined) { allowed = known; break }
      if (seen.has(current.id)) { allowed = false; break }
      seen.add(current.id); path.push(current.id)
      if (!this.own(current)) { allowed = false; break }
      if (!current.parentId) break
      current = this.index.get(current.parentId)
      if (!current) allowed = false
    }
    path.forEach(id => this.memo.set(id, allowed))
    return allowed
  }

  private own(layer: Layer): boolean {
    const flag = (field: 'hidden' | 'locked' | 'frozen') => {
      const value = this.overrides.get(`layers.${layer.id}.${field}`)
      return typeof value === 'boolean' ? value : !!layer[field]
    }
    const opacity = this.overrides.get(`layers.${layer.id}.opacity`)
    return layer.type !== 'audio' && (!this.scope || this.scope.has(layer.id))
      && !flag('locked') && !flag('frozen') && (typeof opacity === 'number' ? opacity : layer.opacity ?? 1) > 0
      && layerDrawActive({ ...layer, hidden: flag('hidden') }, this.timeMs)
  }
}
