import type { ChronoScene } from '../../types'
import type { AuthoringAddress } from '../../types/authoring'
import { retainLayerSelection, type LayerSelection } from '../../selection/layerSelection'

/** Detached identity metadata for one selected layer. The stable address uses
 * the source identity tuple convention, never a mutable layer-array index.
 * Full authored properties remain in the accompanying scene.layers record. */
export interface SelectedSceneLayer {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly address: Extract<AuthoringAddress, readonly ['layer', string]>
  readonly parentId: string | null
}

/** Read-time UI focus, outside source JSON and undo history. Arrays preserve
 * selection insertion order; primaryLayerId is a member or null when empty.
 * This context is neither an edit permission nor an implicit command target. */
export interface SceneSelection {
  readonly primaryLayerId: string | null
  readonly layerIds: readonly string[]
  readonly layers: readonly SelectedSceneLayer[]
}

/** Convert a borrowed editor selection into caller-owned JSON metadata for the
 * supplied authored scene. Missing/deleted IDs are dropped using the editor's
 * selection policy; a removed primary falls back to the first surviving ID.
 * Neither source nor selection is mutated or retained. Names/types/parents are
 * read fresh from source; no animation evaluation or coordinate conversion runs.
 * Returns null when the host cannot report selection, distinct from a known
 * empty selection. No state, subscriptions or resources survive this call. */
export function captureSceneSelection(scene: ChronoScene, selection?: LayerSelection): SceneSelection | null {
  if (!selection) return null
  const byId = new Map(scene.layers.map(layer => [layer.id, layer]))
  const current = retainLayerSelection(selection, new Set(byId.keys()))
  const layerIds = Array.from(current.selectedIds)
  return {
    primaryLayerId: current.primaryId,
    layerIds,
    layers: layerIds.map(id => {
      const layer = byId.get(id)!
      return { id, name: layer.name, type: layer.type, address: ['layer', id], parentId: layer.parentId ?? null }
    }),
  }
}
