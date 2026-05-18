// ── CloneTreeResolver (BL-59) ─────────────────────────────────────────────────
//
// Recursively clones a layer subtree (root + descendants) and produces an
// idMap so the caller can remap ALL references safely:
//   - child.parentId  → newParentId (handled here)
//   - track targets   (handled by callers via TrackTargetParser)
//   - mask refs       (TODO Phase 2)
//   - constraint refs (TODO Phase 2)
//
// Without idMap, deep-cloning a group breaks because:
//   1. Children's parentId still points at the OLD group id.
//   2. Animation tracks targeting "layers.OLD_ID.opacity" never fire on
//      the cloned group.
//
// This module is the single source of truth for "how do I clone a tree?".

import type { Layer } from '../types'
import { cloneSingleLayer } from './CloneSingleLayer'
import type {
  CloneOptions,
  CloneTreeResult,
  CloneMetadata,
} from './CloneTypes'

/**
 * Find all direct + transitive descendants of `rootId` in `allLayers`.
 * Returns layers in tree order (root first, then BFS). Does NOT include
 * the root itself.
 */
export function collectDescendants(
  rootId: string,
  allLayers: Layer[],
): Layer[] {
  const out: Layer[] = []
  const byParent = new Map<string, Layer[]>()
  for (const l of allLayers) {
    const p = l.parentId ?? '__root__'
    const arr = byParent.get(p)
    if (arr) arr.push(l)
    else byParent.set(p, [l])
  }

  // BFS — preserves render order across the subtree.
  const queue: string[] = [rootId]
  while (queue.length > 0) {
    const parent = queue.shift()!
    const kids = byParent.get(parent) ?? []
    for (const k of kids) {
      out.push(k)
      queue.push(k.id)
    }
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
  for (let i = 0; i < clones.length; i++) {
    const clone = clones[i]
    if (i === 0) continue // root: keep original parentId
    const oldParentId = clone.parentId
    if (oldParentId && idMap[oldParentId]) {
      clones[i] = { ...clone, parentId: idMap[oldParentId] }
    }
    // If parentId points outside the cloned subtree we leave it alone
    // (the new layer sits at the same level as the original). This is
    // a defensive guard; in practice the BFS above only collects
    // descendants so every child's parentId IS in idMap.
  }

  // 4. TODO Phase 2: remap masks, constraints, follow-path refs.
  //    Pass `idMap` through TrackTargetParser.remapTrackTarget in the
  //    command layer (commands-clone.ts) for animation tracks.

  return {
    clonedRoot: clones[0],
    allClones: clones,
    idMap,
    metadata: metadataMap,
  }
}
