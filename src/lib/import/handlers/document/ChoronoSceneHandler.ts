// ── ChoronoSceneHandler ───────────────────────────────────────────────────────
//
// Handles Chorono scene JSON imports (application/chorono+json).
//
// Behaviour:
//   MERGE — extracts assets, layers, and timelines from the imported scene
//   and adds them into the current scene. Does NOT replace the scene.
//   (Full scene replacement is handled separately by the "Open Scene" action.)
//
// Use cases:
//   • Import a saved composition fragment into the current scene
//   • Merge a scene package exported from another Chorono instance
//   • Programmatic scene composition (combine sub-scenes)
//
// IDs preserve the existing merge semantics; comprehensive collision remapping
// is a separate capability and is not introduced by bounded input reading.

import { BoundedTextReader, type TextInputReader } from '../../../resources/io'
import { isChoronoScene, parseSceneJson } from '../../../format/scene/SceneJsonConverter'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { BaseImportHandler } from '../BaseHandler'
import type {
  ImportFormat,
  ImportOptions,
  ImportResult,
  ImportPreflight,
  ImportProgress,
  ImportWarning,
} from '../../types'
import type { ChronoScene, Layer } from '../../../types/core'
import type { Asset as LegacyAsset } from '../../../types/media'
import type { Asset } from '../../../asset/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert legacy Asset (types/media.ts) to new Asset (asset/types.ts) shape */
function normalizeAsset(a: LegacyAsset): Asset {
  return {
    id:         a.id,
    name:       a.name,
    type:       a.type as Asset['type'],
    url:        a.url,
    width:      a.width,
    height:     a.height,
    durationMs: a.durationMs,
    storage:    { mode: 'external', originalFileName: a.name },
    metadata: {
      importedAt: Date.now(),
      tags:       [],
    },
    // Don't carry over runtime.objectUrl — it's from a different session
    runtime: undefined,
  }
}

/** Patch a layer's internal assetId references using the id remap */
function patchLayerIds(layer: Layer, remap: Map<string, string>): Layer {
  const patched = { ...layer }
  if (patched.image?.assetId && remap.has(patched.image.assetId)) {
    patched.image = { ...patched.image, assetId: remap.get(patched.image.assetId)! }
  }
  if (patched.video?.assetId && remap.has(patched.video.assetId)) {
    patched.video = { ...patched.video, assetId: remap.get(patched.video.assetId)! }
  }
  if (patched.audio?.assetId && remap.has(patched.audio.assetId)) {
    patched.audio = { ...patched.audio, assetId: remap.get(patched.audio.assetId)! }
  }
  return patched
}

// ── Handler ────────────────────────────────────────────────────────────────────

/** Merge-source conversion. Encoded input and UTF-16 text stay admitted through
 * parsing/normalization; parsed scenes/layers are independently owned outputs.
 * Cancellation/budget/IO failures reject, never masquerade as JSON warnings. */
export class ChoronoSceneHandler extends BaseImportHandler {
  readonly kind = 'document' as const
  readonly supportedFormats: ImportFormat[] = ['application/chorono+json']

  /** Borrow bounded text reading; app supplies its shared-budget instance. */
  constructor(private readonly textReader: TextInputReader = new BoundedTextReader()) { super() }

  /** Bounded metadata scan; malformed JSON may warn, resource/abort failures reject. */
  async preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    return this.textReader.withBlob(file, text => {
      const source = this.makeSource(file)
      let scene: ChronoScene | null = null
      const warnings: string[] = []

      try {
        const parsed = JSON.parse(text)
        if (isChoronoScene(parsed)) {
          scene = parsed
        } else {
          warnings.push('File does not look like a Chorono scene — formatVersion field missing or wrong')
        }
      } catch (err) {
        if (!(err instanceof SyntaxError)) throw err
        warnings.push(`Cannot parse JSON: ${(err as Error).message}`)
      }

      const layerCount  = scene?.layers.length  ?? 0
      const assetCount  = (scene?.assets as LegacyAsset[] | undefined)?.length ?? 0
      const features: string[] = []
      if (scene) {
        features.push(`${layerCount} layer${layerCount !== 1 ? 's' : ''}`)
        if (assetCount) features.push(`${assetCount} asset${assetCount !== 1 ? 's' : ''}`)
        if (scene.timelines?.length) features.push(`${scene.timelines.length} timeline${scene.timelines.length !== 1 ? 's' : ''}`)
        if (scene.composition) {
          const { width, height } = scene.composition
          features.push(`${width}×${height} composition`)
        }
      }

      return {
        source,
        format:  'application/chorono+json',
        kind:    'document',
        summary: {
          estimatedLayers:      layerCount,
          estimatedAssets:      assetCount,
          estimatedGroups:      0,
          estimatedTracks:      0,
          estimatedMemoryBytes: file.size * 3,
          detectedFeatures:     features,
          unsupportedFeatures:  [],
        },
        availableOptions: { collection: true },
        defaultOptions:   {},
        warnings,
      }
    }, { ...execution, label: 'Scene JSON text' })
  }

  /** Convert admitted source to independently owned result data; manager owns final publication checks. */
  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading scene JSON…', 0.1)

    return this.textReader.withBlob(file, text => {
      this.reportProgress(onProgress, 'parsing', 'Parsing scene…', 0.3)
      checkImportExecution(execution)
      const scene = parseSceneJson(text)
      this.reportProgress(onProgress, 'converting', 'Importing layers…', 0.6)
      checkImportExecution(execution)

      // ── Normalise assets ──────────────────────────────────────────────────────
      const rawAssets = (scene.assets ?? []) as LegacyAsset[]
      const assetRemap = new Map<string, string>()

      const assets: Asset[] = rawAssets.map(a => {
        const normalized = normalizeAsset(a)
        if (a.id !== normalized.id) {
          assetRemap.set(a.id, normalized.id)
        }
        return normalized
      })

      // ── Normalise layers ──────────────────────────────────────────────────────
      const layerRemap = new Map<string, string>()
      const layers: Layer[] = scene.layers.map(layer => {
        let patched = assetRemap.size > 0 ? patchLayerIds(layer, assetRemap) : layer

        // Check if layer ID needs remapping (will be done at transaction level,
        // but we track it here for the report)
        layerRemap.set(layer.id, patched.id)
        return patched
      })

      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)

      const warnings: ImportWarning[] = []
      if (layers.length === 0) {
        warnings.push({
          code:     'unsupported_feature',
          severity: 'warning',
          message:  'Scene contains no layers',
        })
      }

      // Include timelines from the imported scene
      const timelines = scene.timelines ?? []

      return {
        id:      this.generateId(),
        source:  this.makeSource(file),
        format:  'application/chorono+json',
        kind:    'document',
        assets,
        layers,
        groups:  [],
        tracks:  [],
        timelines,
        commands: [],
        warnings,
        errors:             [],
        unsupportedFeatures: [],
        report: {
          title:          'Chorono Scene Import',
          sourceFileName: file.name,
          format:         'application/chorono+json',
          created: {
            assets:       assets.length,
            layers:       layers.length,
            groups:       0,
            tracks:       0,
            compositions: timelines.length,
          },
          warnings:            warnings.map(w => ({ ...w, affectedIds: [] })),
          errors:              [],
          unsupportedFeatures: [],
          suggestions: timelines.length > 0
            ? ['Imported timelines were added to the scene. Review timeline panel to merge or activate them.']
            : [],
          durationMs: Date.now() - startMs,
        },
      }
    }, { ...execution, label: 'Scene JSON text' })
  }
}
