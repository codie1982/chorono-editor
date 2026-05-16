// ── SceneTraversal ────────────────────────────────────────────────────────────
//
// Builds a virtual tree from a flat Layer[] using parentId references. The
// flat list stays the canonical source of truth (preserves JSON format and
// existing z-order semantics — index = stacking order); the tree is just a
// cached view for traversal-heavy operations:
//
//   - GroupRenderer needs to walk children under a group transform
//   - Selection model needs "ancestors of layer X" for Tab navigation
//   - Cycle detection needs to know whether moving X under Y creates a loop
//
// The tree is built lazily per call. WeakMap caching keeps build cost O(n)
// amortised even when called repeatedly with the same layers array.

import type { Layer } from '@/lib/types'

export interface SceneNode {
  layer:    Layer
  children: SceneNode[]
  depth:    number
}

const cache = new WeakMap<Layer[], SceneNode[]>()

export class SceneTraversal {
  /** Root nodes (those with no parentId). Children are nested. */
  static buildTree(layers: Layer[]): SceneNode[] {
    const cached = cache.get(layers)
    if (cached) return cached

    const byId = new Map<string, SceneNode>()
    for (const layer of layers) {
      byId.set(layer.id, { layer, children: [], depth: 0 })
    }

    const roots: SceneNode[] = []
    for (const layer of layers) {
      const node = byId.get(layer.id)!
      const parentId = (layer as any).parentId as string | undefined
      if (parentId && byId.has(parentId)) {
        const parent = byId.get(parentId)!
        node.depth   = parent.depth + 1
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
    cache.set(layers, roots)
    return roots
  }

  /** Walk the tree pre-order (parent before children). */
  static walk(roots: SceneNode[], visit: (node: SceneNode, ancestors: SceneNode[]) => void): void {
    const rec = (node: SceneNode, ancestors: SceneNode[]) => {
      visit(node, ancestors)
      const nextAncestors = [...ancestors, node]
      for (const child of node.children) rec(child, nextAncestors)
    }
    for (const root of roots) rec(root, [])
  }

  /** Find a node by layer id (linear scan; tree usually small). */
  static findNode(roots: SceneNode[], layerId: string): SceneNode | null {
    let found: SceneNode | null = null
    this.walk(roots, (node) => { if (node.layer.id === layerId) found = node })
    return found
  }

  /** Returns ancestor nodes from root → direct parent. Empty if not found or root. */
  static getAncestors(roots: SceneNode[], layerId: string): SceneNode[] {
    let result: SceneNode[] = []
    this.walk(roots, (node, ancestors) => {
      if (node.layer.id === layerId) result = ancestors
    })
    return result
  }

  /** Returns true if `candidateParentId` is a descendant of `layerId` (cycle). */
  static wouldCreateCycle(
    layers:            Layer[],
    layerId:           string,
    candidateParentId: string,
  ): boolean {
    if (layerId === candidateParentId) return true
    const tree = this.buildTree(layers)
    const node = this.findNode(tree, layerId)
    if (!node) return false
    let cycle = false
    this.walk([node], (n) => { if (n.layer.id === candidateParentId) cycle = true })
    return cycle
  }
}
