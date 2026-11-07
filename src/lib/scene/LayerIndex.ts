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
 * or recursively expanded here. Traversal callers retain their cycle guards.
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
}
