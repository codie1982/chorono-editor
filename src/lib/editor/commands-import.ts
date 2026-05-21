// ── Import Commands ───────────────────────────────────────────────────────────
//
// Atomic EditorCommands for all import types.
// Every import is one undo step — regardless of how many assets/layers it creates.
//
// Usage:
//   const cmd = makeImportAssetsCmd([asset], [layer], 'logo.png')
//   dispatchCommand(cmd)

import type { ChronoScene } from '../types'
import type { EditorCommand } from './commands-keyframe'
import type { Asset }   from '../asset/types'
import type { Layer }   from '../types/core'
import type { Track }   from '../types/core'

// ── Asset Import Command ──────────────────────────────────────────────────────

/**
 * Adds one or more assets + their layers atomically.
 * Used by Image, Video, Audio, Font handlers.
 */
export function makeImportAssetsCmd(
  assets: Asset[],
  layers: Layer[],
  label?: string,
): EditorCommand {
  const assetIds = new Set(assets.map(a => a.id))
  const layerIds = new Set(layers.map(l => l.id))
  const cmdLabel = label
    ?? (assets.length === 1 ? `Import ${assets[0].name}` : `Import ${assets.length} assets`)

  return {
    label: cmdLabel,
    execute(scene: ChronoScene): ChronoScene {
      const existingAssetIds = new Set(scene.assets.map(a => a.id))
      const existingLayerIds = new Set(scene.layers.map(l => l.id))
      return {
        ...scene,
        assets: [
          ...scene.assets,
          ...assets.filter(a => !existingAssetIds.has(a.id)),
        ],
        layers: [
          ...scene.layers,
          ...layers.filter(l => !existingLayerIds.has(l.id)),
        ],
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      return {
        ...scene,
        assets: scene.assets.filter(a => !assetIds.has(a.id)),
        layers: scene.layers.filter(l => !layerIds.has(l.id)),
      }
    },
  }
}

// ── Document Import Command ───────────────────────────────────────────────────

/**
 * Adds all items from a complex document import atomically:
 * assets, layers, and optionally tracks merged into the active timeline.
 * Used by SVG, Lottie, DXF handlers.
 */
export function makeImportDocumentCmd(params: {
  assets:    Asset[]
  layers:    Layer[]
  tracks?:   Track[]
  timelineId?: string
  label:     string
}): EditorCommand {
  const { assets, layers, tracks = [], timelineId, label } = params
  const assetIds = new Set(assets.map(a => a.id))
  const layerIds = new Set(layers.map(l => l.id))
  const trackTargets = new Set(tracks.map(t => t.target))

  return {
    label,
    execute(scene: ChronoScene): ChronoScene {
      const existingAssetIds = new Set(scene.assets.map(a => a.id))
      const existingLayerIds = new Set(scene.layers.map(l => l.id))

      let newTimelines = scene.timelines

      // Merge tracks into the target timeline (or first one)
      if (tracks.length > 0 && newTimelines.length > 0) {
        const targetId = timelineId ?? newTimelines[0].id
        newTimelines = newTimelines.map(tl => {
          if (tl.id !== targetId) return tl
          const existingTargets = new Set(tl.tracks.map(t => t.target))
          return {
            ...tl,
            tracks: [
              ...tl.tracks,
              ...tracks.filter(t => !existingTargets.has(t.target)),
            ],
          }
        })
      }

      return {
        ...scene,
        assets: [
          ...scene.assets,
          ...assets.filter(a => !existingAssetIds.has(a.id)),
        ],
        layers: [
          ...scene.layers,
          ...layers.filter(l => !existingLayerIds.has(l.id)),
        ],
        timelines: newTimelines,
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      return {
        ...scene,
        assets: scene.assets.filter(a => !assetIds.has(a.id)),
        layers: scene.layers.filter(l => !layerIds.has(l.id)),
        timelines: tracks.length === 0 ? scene.timelines : scene.timelines.map(tl => ({
          ...tl,
          tracks: tl.tracks.filter(t => !trackTargets.has(t.target)),
        })),
      }
    },
  }
}

// ── Delete Asset Command ──────────────────────────────────────────────────────

/**
 * Removes an asset and all layers that reference it.
 * Used by "Delete Asset" in the Asset Library panel.
 */
export function makeDeleteAssetCmd(
  assetId: string,
  referencingLayerIds: string[],
  prevScene: ChronoScene,
): EditorCommand {
  const assetToDelete = prevScene.assets.find(a => a.id === assetId)
  const layersToDelete = prevScene.layers.filter(l => referencingLayerIds.includes(l.id))

  return {
    label: `Delete asset${assetToDelete ? ` "${assetToDelete.name}"` : ''}`,
    execute(scene: ChronoScene): ChronoScene {
      return {
        ...scene,
        assets: scene.assets.filter(a => a.id !== assetId),
        layers: scene.layers.filter(l => !referencingLayerIds.includes(l.id)),
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      if (!assetToDelete) return scene
      const existingAssetIds = new Set(scene.assets.map(a => a.id))
      const existingLayerIds = new Set(scene.layers.map(l => l.id))
      return {
        ...scene,
        assets: existingAssetIds.has(assetId)
          ? scene.assets
          : [...scene.assets, assetToDelete],
        layers: [
          ...scene.layers,
          ...layersToDelete.filter(l => !existingLayerIds.has(l.id)),
        ],
      }
    },
  }
}

// ── Move Asset to Collection Command ─────────────────────────────────────────

/**
 * Moves an asset to a different collection.
 * Used by the Asset Library panel's drag-to-collection feature.
 */
export function makeAddAssetToCollectionCmd(
  assetId: string,
  collectionId: string,
): EditorCommand {
  return {
    label: 'Add to collection',
    execute(scene: ChronoScene): ChronoScene {
      const collections = scene.assetCollections ?? []
      return {
        ...scene,
        assetCollections: collections.map(col => {
          if (col.id !== collectionId) return col
          if (col.assetIds.includes(assetId)) return col
          return { ...col, assetIds: [...col.assetIds, assetId] }
        }),
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      const collections = scene.assetCollections ?? []
      return {
        ...scene,
        assetCollections: collections.map(col => {
          if (col.id !== collectionId) return col
          return { ...col, assetIds: col.assetIds.filter(id => id !== assetId) }
        }),
      }
    },
  }
}
