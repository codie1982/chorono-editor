import type { Layer } from '@/lib/types'

/** Minimal id lookup for numerical/instance helpers; no renderer or platform dependency. */
export interface LayerLookup {
  get(id: string): Layer | undefined
}

/** Ordered flat-scene relationships. Orphans are not promoted to roots. */
export interface LayerRelations extends LayerLookup {
  readonly roots: readonly Layer[]
  childrenOf(parentId: string): readonly Layer[]
}

const EMPTY_CHILDREN: readonly Layer[] = Object.freeze([])

/**
 * Non-owning, O(n)-build / expected O(1)-lookup view of one flat layer snapshot.
 * Roots and siblings retain input stacking order; only a falsy parentId makes
 * a root, matching the renderer's filter (unlike SceneTraversal's orphan tree).
 * Missing parents, hidden layers and reference cycles remain data, not repaired
 * by construction. subtreeIds() explicitly traverses with its own cycle guard;
 * other traversal callers retain responsibility for their guards.
 *
 * Valid scenes have unique ids. For malformed duplicates, get() returns the
 * first occurrence just as Array.find does; relationship lists keep all input
 * entries. Layer objects are borrowed, never cloned/frozen/mutated. Only the
 * relationship arrays are frozen. The owner must rebuild after any membership,
 * id, parent or object replacement, including in-place edits. Keep this local
 * to one render/evaluated frame; no global cache retains old scene snapshots.
 */
export class LayerIndex implements LayerRelations {
  private readonly byId = new Map<string, Layer>()
  private readonly children = new Map<string, readonly Layer[]>()
  readonly roots: readonly Layer[]

  /** Indexes all references once; does not evaluate time, visibility, transforms or instances. */
  constructor(layers: readonly Layer[]) {
    const roots: Layer[] = [], children = new Map<string, Layer[]>()
    for (const layer of layers) {
      if (!this.byId.has(layer.id)) this.byId.set(layer.id, layer)
      if (!layer.parentId) roots.push(layer)
      else {
        const siblings = children.get(layer.parentId)
        if (siblings) siblings.push(layer)
        else children.set(layer.parentId, [layer])
      }
    }
    this.roots = Object.freeze(roots)
    children.forEach((siblings, id) => this.children.set(id, Object.freeze(siblings)))
  }

  /** Returns the borrowed first matching layer, or undefined; does not change ordering/state. */
  get(id: string): Layer | undefined { return this.byId.get(id) }

  /** Direct children in original stacking order, including hidden ones; shared empty view if absent. */
  childrenOf(parentId: string): readonly Layer[] { return this.children.get(parentId) ?? EMPTY_CHILDREN }

  /** Ancestor closure for one or several identities, optionally including each
   * source itself. Missing parents are not invented; overlapping chains/cycles
   * are visited once. Caller owns the set, source and sibling order stay intact.
   * O(number of reached ancestors); no recursive or whole-tree scan per match.
   */
  ancestorIds(ids: Iterable<string>, includeSelf = true): Set<string> {
    const result = new Set<string>(), walked = new Set<string>()
    for (const id of Array.from(ids)) {
      let item = this.get(id)
      if (item && includeSelf) result.add(id)
      let parentId = item?.parentId
      while (parentId && !walked.has(parentId)) {
        walked.add(parentId); item = this.get(parentId)
        if (!item) break
        result.add(item.id); parentId = item.parentId
      }
    }
    return result
  }

  /** Collect existing roots and descendants in deterministic pre-order with
   * authored sibling order. Overlapping roots and cycles are visited once; missing
   * ids are ignored. includeRoots=false excludes every supplied root. Returns
   * a caller-owned id set in O(n + roots), without recursion/model mutation.
   */
  subtreeIds(rootIds: readonly string[] | ReadonlySet<string>, includeRoots = true): Set<string> {
    const roots = Array.from(rootIds), pending = roots.filter(id => this.byId.has(id)).reverse(), ids = new Set<string>()
    while (pending.length) {
      const id = pending.pop()!
      if (ids.has(id)) continue
      ids.add(id)
      const children = this.childrenOf(id)
      for (let i = children.length - 1; i >= 0; i--) pending.push(children[i].id)
    }
    if (!includeRoots) roots.forEach(id => ids.delete(id))
    return ids
  }
}
