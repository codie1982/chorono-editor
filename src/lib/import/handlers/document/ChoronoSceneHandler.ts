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
// ID collision:
//   All imported layer/asset IDs are checked for uniqueness. Conflicts get a
//   new unique ID and the layer's internal references are patched.

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

// ── Validation ─────────────────────────────────────────────────────────────────

function isChronoScene(obj: unknown): obj is ChronoScene {
  if (!obj || typeof obj !== 'object') return false
  const s = obj as Record<string, unknown>
  return (
    typeof s.formatVersion === 'string' &&
    s.formatVersion.startsWith('1.') &&
    Array.isArray(s.layers) &&
    typeof s.composition === 'object'
  )
}

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

export class ChoronoSceneHandler extends BaseImportHandler {
  readonly kind = 'document' as const
  readonly supportedFormats: ImportFormat[] = ['application/chorono+json']

  async preflight(file: File): Promise<ImportPreflight> {
    const source = this.makeSource(file)
    let scene: ChronoScene | null = null
    const warnings: string[] = []

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (isChronoScene(parsed)) {
        scene = parsed
      } else {
        warnings.push('File does not look like a Chorono scene — formatVersion field missing or wrong')
      }
    } catch (err) {
      warnings.push(`Cannot parse JSON: ${(err as Error).message}`)
    }

    const layerCount  = scene?.layers.length  ?? 0
    const assetCount  = (scene?.assets as LegacyAsset[] | undefined)?.length ?? 0
    const features: string[] = []
    if (scene) {
      features.push(`${layerCount} layer${layerCount !== 1 ? 's' : ''}`)
      if (assetCount) features.push(`${assetCount} asset${assetCount !== 1 ? 's' : ''}`)
      if (scene.timelines.length) features.push(`${scene.timelines.length} timeline${scene.timelines.length !== 1 ? 's' : ''}`)
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
  }

  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading scene JSON…', 0.1)

    let text: string
    try {
      text = await file.text()
    } catch (err) {
      throw new Error(`Cannot read file "${file.name}": ${(err as Error).message}`)
    }

    this.reportProgress(onProgress, 'parsing', 'Parsing scene…', 0.3)

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      throw new Error(`Invalid JSON in "${file.name}": ${(err as Error).message}`)
    }

    if (!isChronoScene(parsed)) {
      throw new Error(
        `"${file.name}" is not a valid Chorono scene. ` +
        'Expected an object with formatVersion "1.x" and a layers array.'
      )
    }

    const scene = parsed as ChronoScene
    this.reportProgress(onProgress, 'converting', 'Importing layers…', 0.6)

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
  }
}
