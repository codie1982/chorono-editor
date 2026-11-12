// ── CloneTreeResolver (BL-59) ─────────────────────────────────────────────────
//
// Recursively clones a layer subtree (root + descendants) and produces an
// idMap so the caller can remap ALL references safely:
//   - child.parentId  → newParentId (handled here)
//   - track targets   (handled by callers via TrackTargetParser)
//   - mask / follow / repeater / particle / baked-trail layer references
//     (shared typed CloneReferenceRemapper)
//
// Without idMap, deep-cloning a group breaks because:
//   1. Children's parentId still points at the OLD group id.
//   2. Animation tracks targeting "layers.OLD_ID.opacity" never fire on
//      the cloned group.
//
// This module is the single source of truth for "how do I clone a tree?".

import type { Layer } from '../types'
import { cloneSingleLayer } from './CloneSingleLayer'
import { remapCloneLayerReferences } from './CloneReferenceRemapper'
import { LayerIndex } from '../scene/LayerIndex'
import type {
  CloneOptions,
  CloneTreeResult,
  CloneMetadata,
} from './CloneTypes'

/**
 * Find all direct + transitive descendants of `rootId` in `allLayers`.
 * Returns descendants in breadth-first order with authored sibling order;
 * does NOT include the root itself. Cycles reject rather than looping forever.
 */
export function collectDescendants(
  rootId: string,
  allLayers: Layer[],
): Layer[] {
  const index = new LayerIndex(allLayers), seen = new Set([rootId]), queue = [rootId], out: Layer[] = []
  for (let i = 0; i < queue.length; i++) for (const child of index.childrenOf(queue[i])) {
    if (seen.has(child.id)) throw new Error('Repair the cyclic layer hierarchy before cloning.')
    seen.add(child.id); queue.push(child.id); out.push(child)
  }
  return out
}

/**
 * Clone an entire layer subtree.
 *
 * @param sourceRoot  The root of the subtree to clone (often a group).
 * @param allLayers   The scene's full layer array — needed to find
 *                    children by parentId.
 * @param options     Clone options. `offsetX/Y` are applied to the
 *                    ROOT only; children retain their relative
 *                    positions inside the parent.
 *
 * @returns CloneTreeResult with:
 *   - clonedRoot     : the new root layer
 *   - allClones      : root + all descendant clones in tree order
 *   - idMap          : oldId → newId for EVERY node in the subtree
 *   - metadata       : per-clone CloneMetadata, keyed by NEW id
 */
export function cloneLayerTree(
  sourceRoot: Layer,
  allLayers: Layer[],
  options: CloneOptions = {},
): CloneTreeResult {
  // 1. Collect source subtree in tree order.
  const descendants = collectDescendants(sourceRoot.id, allLayers)
  const sourceSubtree = [sourceRoot, ...descendants]

  // 2. Clone every node (offset applied to root only).
  const idMap: Record<string, string> = {}
  const metadataMap: Record<string, CloneMetadata> = {}
  const clones: Layer[] = []

  for (let i = 0; i < sourceSubtree.length; i++) {
    const source = sourceSubtree[i]
    const isRoot = i === 0

    const perNodeOptions: CloneOptions = {
      ...options,
      // Only the root gets the user-requested offset. Descendants keep
      // their relative layout inside the new group — applying offset
      // again would compound the shift.
      offsetX: isRoot ? options.offsetX : 0,
      offsetY: isRoot ? options.offsetY : 0,
      // Name override only meaningful for the root.
      nameOverride: isRoot ? options.nameOverride : undefined,
    }

    const { clonedLayer, idMap: oneMap, metadata } = cloneSingleLayer(
      source,
      perNodeOptions,
    )

    idMap[source.id] = clonedLayer.id
    metadataMap[clonedLayer.id] = metadata
    clones.push(clonedLayer)
  }

  // 3. Remap parentId on every clone using the freshly built idMap.
  //    The root's parentId stays as-is (it sits next to the source);
  //    descendants get remapped to point at their NEW parent.
  for (let i = 0; i < clones.length; i++) clones[i] = remapCloneLayerReferences(clones[i], idMap)

  return {
    clonedRoot: clones[0],
    allClones: clones,
    idMap,
    metadata: metadataMap,
  }
}
