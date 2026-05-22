// ── LottieDocumentHandler ─────────────────────────────────────────────────────
//
// Handles Lottie JSON + dotLottie package imports.
//
// Phase 1 (current): Reads metadata (w/h/fps/duration), creates a LottieAsset.
//   No editable layers yet — placeholder layer with "Lottie (not yet editable)" note.
//
// Phase 3 (planned): Full keyframe conversion — Lottie shape layers → Chorono
//   path/shape layers, transform tracks → Chorono animation tracks.
//
// Why import even partially now? So the file goes into the Asset Library and
// becomes available for Phase 3 without a re-import step.

import { BaseImportHandler } from '../BaseHandler'
import { zipReader } from '../../zip/ZipReader'
import type {
  ImportFormat,
  ImportOptions,
  ImportResult,
  ImportPreflight,
  ImportProgress,
  ImportWarning,
} from '../../types'
import type { Asset } from '../../../asset/types'

// ── Minimal Lottie JSON shape ──────────────────────────────────────────────────

interface LottieManifest {
  v?: string      // version string e.g. "5.7.4"
  nm?: string     // animation name
  w?: number      // width
  h?: number      // height
  fr?: number     // frame rate
  ip?: number     // in-point (usually 0)
  op?: number     // out-point (last frame)
  layers?: unknown[]
  assets?: unknown[]
}

function parseLottieManifest(text: string): LottieManifest | null {
  try {
    return JSON.parse(text) as LottieManifest
  } catch {
    return null
  }
}

function lottieDurationMs(manifest: LottieManifest): number {
  if (!manifest.fr || !manifest.op) return 0
  const frames = (manifest.op - (manifest.ip ?? 0))
  return Math.round((frames / manifest.fr) * 1000)
}

/**
 * Read the animation JSON out of a dotLottie (ZIP) package and parse its
 * metadata. Returns null if the file isn't a readable dotLottie.
 */
async function readDotLottieManifest(file: File): Promise<LottieManifest | null> {
  try {
    const buf = await file.arrayBuffer()
    const entries = zipReader.readEntries(buf)
    // dotLottie keeps Lottie data under animations/*.json
    const anim = entries.find(e => /animations\/.*\.json$/i.test(e.name))
              ?? entries.find(e => e.name.toLowerCase().endsWith('.json') && e.name !== 'manifest.json')
    if (!anim) return null
    const bytes = await zipReader.extract(buf, anim)
    return parseLottieManifest(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export class LottieDocumentHandler extends BaseImportHandler {
  readonly kind = 'document' as const
  readonly supportedFormats: ImportFormat[] = [
    'application/lottie+json',
    'application/dotlottie',
  ]

  async preflight(file: File): Promise<ImportPreflight> {
    const source = this.makeSource(file)
    const format = this.getFormat(file)

    let manifest: LottieManifest | null = null
    if (format === 'application/lottie+json') {
      try {
        const text = await file.text()
        manifest = parseLottieManifest(text)
      } catch { /* ignore */ }
    } else {
      manifest = await readDotLottieManifest(file)
    }

    const features: string[] = []
    if (manifest) {
      if (manifest.w && manifest.h) features.push(`${manifest.w}×${manifest.h} px`)
      if (manifest.fr) features.push(`${manifest.fr} fps`)
      const dur = lottieDurationMs(manifest)
      if (dur > 0) features.push(`${(dur / 1000).toFixed(2)} s`)
      if (manifest.layers?.length) features.push(`${manifest.layers.length} layer(s)`)
    }

    return {
      source,
      format,
      kind:    'document',
      summary: {
        estimatedLayers:      0,   // Phase 3 will produce real layers
        estimatedAssets:      1,
        estimatedGroups:      0,
        estimatedTracks:      0,
        estimatedMemoryBytes: file.size * 2,
        detectedFeatures:     features,
        unsupportedFeatures:  ['Editable layer conversion (Phase 3)'],
      },
      availableOptions: { collection: true },
      defaultOptions:   {},
      warnings: [
        'Full editable Lottie import is planned for Phase 3. '
        + 'This import stores the asset for future use.',
      ],
    }
  }

  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    const format  = this.getFormat(file)
    this.reportProgress(onProgress, 'reading', 'Reading Lottie…', 0.1)

    let manifest: LottieManifest | null = null
    if (format === 'application/lottie+json') {
      try {
        const text = await file.text()
        manifest = parseLottieManifest(text)
      } catch { /* ignore */ }
    } else {
      this.reportProgress(onProgress, 'parsing', 'Unpacking dotLottie…', 0.4)
      manifest = await readDotLottieManifest(file)
    }

    this.reportProgress(onProgress, 'converting', 'Creating asset…', 0.7)

    const url        = URL.createObjectURL(file)
    const assetId    = this.generateAssetId()
    const durationMs = manifest ? lottieDurationMs(manifest) : 0
    const width      = manifest?.w ?? 0
    const height     = manifest?.h ?? 0

    const asset: Asset = {
      id:         assetId,
      name:       file.name.replace(/\.(json|lottie)$/i, ''),
      type:       'lottie',
      url,
      width:      width  || undefined,
      height:     height || undefined,
      durationMs: durationMs || undefined,
      storage:  { mode: 'external', originalFileName: file.name },
      metadata: {
        filesize:   file.size,
        importedAt: Date.now(),
        sourceApp:  'Lottie',
        tags:       [],
        notes:      manifest?.v ? `Lottie v${manifest.v}` : undefined,
      },
      runtime: { objectUrl: url },
    }

    const warnings: ImportWarning[] = [{
      code:     'unsupported_feature',
      severity: 'info',
      message:  'Lottie stored as asset. Editable layer conversion is planned for Phase 3.',
    }]

    this.reportProgress(onProgress, 'complete', 'Done', 1)

    return {
      id:      this.generateId(),
      source:  this.makeSource(file),
      format,
      kind:    'document',
      assets:  [asset],
      layers:  [],    // Phase 3: convert Lottie layers → Chorono layers
      groups:  [],
      tracks:  [],
      timelines: [],
      commands:  [],
      warnings,
      errors:             [],
      unsupportedFeatures: [{
        feature:     'Lottie layer conversion',
        description: 'Shape layers, transforms and keyframes will be importable as editable Chorono layers in Phase 3',
        fallback:    'placeholder',
      }],
      report: {
        title:          'Lottie Import',
        sourceFileName: file.name,
        format,
        created: { assets: 1, layers: 0, groups: 0, tracks: 0, compositions: 0 },
        warnings,
        errors:  [],
        unsupportedFeatures: [{
          feature:     'Lottie layer conversion',
          description: 'Phase 3 — full editable import planned',
          fallback:    'placeholder',
        }],
        suggestions: [
          'Once Phase 3 is available, re-import this file to get editable layers and keyframes.',
        ],
        durationMs: Date.now() - startMs,
      },
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getFormat(file: File): ImportFormat {
    if (file.name.toLowerCase().endsWith('.lottie')) return 'application/dotlottie'
    if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
      return 'application/lottie+json'
    }
    return 'application/lottie+json'
  }
}
