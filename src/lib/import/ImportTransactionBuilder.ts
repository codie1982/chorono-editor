// ── ImportTransactionBuilder ──────────────────────────────────────────────────
//
// Wraps an ImportResult into a single atomic EditorCommand.
// Undo removes all assets + layers + tracks created by this import in one step.
//
// Example:
//   DXF import → 820 path layers + 14 groups + assets
//   Ctrl+Z → removes all of them atomically

import type { ChronoScene }   from '../types/core'
import type { EditorCommand } from '../editor/commands-keyframe'
import type { ImportResult, ImportTransaction, BaseImportOptions } from './types'
import { makeAddAudioClipCmd } from '../editor/commands-audio'
import type { Asset }  from '../asset/types'
import type { Layer }  from '../types/core'

// ── Builder ───────────────────────────────────────────────────────────────────

export class ImportTransactionBuilder {

  /**
   * Build an atomic EditorCommand from a completed ImportResult.
   * The command adds all layers + assets to the scene.
   * Undo removes all of them.
   */
  build(result: ImportResult, options: BaseImportOptions = {}): EditorCommand {
    const { assets, layers, tracks, timelines } = result
    const label = this.buildLabel(result)

    // Snapshot IDs for undo
    const layerIds = new Set(layers.map(l => l.id))
    const assetIds = new Set(assets.map(a => a.id))
    const audioLayers = result.kind === 'asset' ? layers.filter(layer => layer.type === 'audio' && layer.audio) : []
    let beforeAudioImport: ChronoScene | undefined

    const command: EditorCommand = {
      label,
      authoring: { mode: 'import' },

      execute(scene: ChronoScene): ChronoScene {
        beforeAudioImport = scene
        // 1. Add assets
        const newAssets = dedup(scene.assets, assets, a => a.id) as Asset[]

        // 2. Add layers (append to end)
        const newLayers = [...scene.layers, ...layers.filter(layer => !audioLayers.includes(layer))]

        // 3. Merge tracks into existing timelines or add new ones
        let newTimelines = scene.timelines
        if (tracks.length > 0 && newTimelines.length > 0) {
          // Merge tracks into the first/active timeline
          newTimelines = newTimelines.map((tl, i) => {
            if (i !== 0) return tl
            return {
              ...tl,
              tracks: dedup(tl.tracks, tracks, t => t.target) as typeof tl.tracks,
            }
          })
        }
        // Add any brand-new timelines from document imports
        if (timelines.length > 0) {
          const existingIds = new Set(newTimelines.map(t => t.id))
          const toAdd = timelines.filter(t => !existingIds.has(t.id))
          newTimelines = [...newTimelines, ...toAdd]
        }

        let next: ChronoScene = {
          ...scene,
          assets:    newAssets,
          layers:    newLayers,
          timelines: newTimelines,
        }
        for (const layer of audioLayers) {
          const asset = next.assets.find(item => item.id === layer.audio!.assetId)
          if (!asset) throw new Error('Imported audio source was not found.')
          next = makeAddAudioClipCmd(asset, { layer, timelineId: options.timelineId, startMs: options.startMs }).execute(next)
        }
        return next
      },

      undo(scene: ChronoScene): ChronoScene {
        if (audioLayers.length && beforeAudioImport) return beforeAudioImport
        return {
          ...scene,
          assets:    scene.assets.filter(a => !assetIds.has(a.id)),
          layers:    scene.layers.filter(l => !layerIds.has(l.id)),
          timelines: scene.timelines,
        }
      },
    }

    return command
  }

  /**
   * Build an ImportTransaction record for history/audit.
   * This is separate from the EditorCommand — it's metadata.
   */
  buildTransaction(result: ImportResult, command: EditorCommand): ImportTransaction {
    return {
      id:        `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label:     command.label,
      format:    result.format,
      timestamp: Date.now(),

      createdAssetIds:  result.assets.map(a => a.id),
      createdLayerIds:  result.layers.map(l => l.id),
      createdGroupIds:  result.groups.map(g => g.id),
      createdTrackIds:  result.tracks.map(t => t.target),

      command,
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private buildLabel(result: ImportResult): string {
    const { format, source, layers, assets } = result
    const name = source.value.split('/').pop() ?? source.value
    const count = layers.length

    if (count === 0 && assets.length === 1) {
      return `Import ${assets[0].name}`
    }
    if (count === 1) {
      return `Import ${layers[0].name}`
    }
    return `Import ${name} (${count} layers)`
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Merge new items into existing array, deduplicating by key */
function dedup<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  if (incoming.length === 0) return existing
  const existingIds = new Set(existing.map(key))
  const toAdd = incoming.filter(item => !existingIds.has(key(item)))
  return [...existing, ...toAdd]
}
