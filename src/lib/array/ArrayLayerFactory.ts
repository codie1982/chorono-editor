// ── ArrayLayerFactory (BL-59) ─────────────────────────────────────────────────
//
// Converts ArrayInstanceTransform[] into actual Layer[]. Bridges the
// pure-math resolver and the EditorCommand layer.
//
// Skips entries where isSourceIndex=true UNLESS sourcePolicy is
// 'clone-source-too' (in which case the source itself also gets a clone
// at its original position).

import type { Layer } from '../types'
import type {
  ArrayInstanceTransform,
  ArraySettings,
} from './ArrayTypes'
import { cloneSingleLayer } from '../clone/CloneSingleLayer'
import type {
  CloneTreeResult,
  CloneMetadata,
} from '../clone/CloneTypes'
import { cloneLayerTree } from '../clone/CloneTreeResolver'

/** All output of a single array operation. */
export interface ArrayFactoryResult {
  /** Newly created clone layers (does NOT include the source). */
  newLayers: Layer[]
  /**
   * Per-instance metadata for EditorState.layerMetaById.
   * Keyed by new layer id.
   */
  metadata: Record<string, CloneMetadata>
  /**
   * Maps array index → new layer id (or `null` if that index is the
   * source itself and was skipped). Used by Preview and timeline-sync
   * to know which clone corresponds to which transform.
   */
  indexToLayerId: Array<string | null>
  /**
   * For each cloned ROOT layer, the full subtree idMap (for group
   * sources). Lets timeline track duplication remap targets safely.
   */
  perInstanceIdMaps: Array<Record<string, string>>
  /**
   * Shared arrayGroupId attached to every clone's metadata. Lets the
   * UI offer "Select All Instances" in O(scene.layers.length).
   */
  arrayGroupId: string
}

/**
 * Build new layers for every transform record produced by the resolver.
 *
 * @param source     The source layer (transform = baseline).
 * @param transforms Output of ArrayTransformResolver.resolveArrayTransforms().
 * @param settings   Array settings (used for cloneMode + sourcePolicy +
 *                   metadata flags).
 * @param allLayers  Full scene.layers (needed when source is a group —
 *                   we deep-clone the subtree via CloneTreeResolver).
 */
export function buildArrayLayers(
  source: Layer,
  transforms: ArrayInstanceTransform[],
  settings: ArraySettings,
  allLayers: Layer[],
): ArrayFactoryResult {
  const arrayGroupId = `array_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const isGroupSource = source.type === 'group'

  const newLayers: Layer[] = []
  const metadata: Record<string, CloneMetadata> = {}
  const indexToLayerId: Array<string | null> = []
  const perInstanceIdMaps: Array<Record<string, string>> = []

  for (const t of transforms) {
    // Skip source-occupied indices (they aren't NEW layers).
    if (t.isSourceIndex) {
      indexToLayerId.push(null)
      perInstanceIdMaps.push({})
      continue
    }

    if (isGroupSource) {
      // Group source: clone entire subtree so child layers get fresh
      // ids and a correctly-remapped parentId chain.
      const tree: CloneTreeResult = cloneLayerTree(source, allLayers, {
        mode: settings.cloneMode,
        arrayGroupId,
      })

      // Apply the transform to the cloned root only.
      tree.clonedRoot.transform = {
        ...tree.clonedRoot.transform,
        x: t.position.x,
        y: t.position.y,
        rotationDeg: t.rotation,
        scaleX: t.scale.x,
        scaleY: t.scale.y,
      }
      if (t.opacity !== source.opacity) {
        tree.clonedRoot.opacity = t.opacity
      }

      // Replace allClones[0] with the modified root (it was mutated in
      // place above, but to keep the array consistent we explicitly
      // copy back).
      tree.allClones[0] = tree.clonedRoot

      for (const c of tree.allClones) {
        newLayers.push(c)
        const meta = tree.metadata[c.id]
        if (meta) metadata[c.id] = meta
      }

      indexToLayerId.push(tree.clonedRoot.id)
      perInstanceIdMaps.push(tree.idMap)
    } else {
      // Leaf source: simple single-layer clone.
      const { clonedLayer, idMap, metadata: cloneMeta } = cloneSingleLayer(
        source,
        {
          mode: settings.cloneMode,
          arrayGroupId,
        },
      )

      clonedLayer.transform = {
        ...clonedLayer.transform,
        x: t.position.x,
        y: t.position.y,
        rotationDeg: t.rotation,
        scaleX: t.scale.x,
        scaleY: t.scale.y,
      }
      if (t.opacity !== source.opacity) {
        clonedLayer.opacity = t.opacity
      }

      newLayers.push(clonedLayer)
      metadata[clonedLayer.id] = cloneMeta
      indexToLayerId.push(clonedLayer.id)
      perInstanceIdMaps.push(idMap)
    }
  }

  return {
    newLayers,
    metadata,
    indexToLayerId,
    perInstanceIdMaps,
    arrayGroupId,
  }
}
