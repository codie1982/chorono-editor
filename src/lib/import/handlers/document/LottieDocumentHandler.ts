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

import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler } from '../BaseHandler'
import { LottieMetadataReader, type LottieMetadataLoader } from './lottie/LottieMetadataReader'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import type {
  ImportFormat,
  ImportOptions,
  ImportResult,
  ImportPreflight,
  ImportProgress,
  ImportWarning,
} from '../../types'
import type { Asset } from '../../../asset/types'

// ── Handler ────────────────────────────────────────────────────────────────────

/** Lottie asset import orchestration. Borrows a bounded metadata port, then
 * transfers the unchanged original source through withImportSource. No decoded
 * buffers/cache are retained; editable layer conversion remains a separate
 * capability. Runtime cancellation is never serialized into results/commands. */
export class LottieDocumentHandler extends BaseImportHandler {
  readonly kind = 'document' as const
  readonly supportedFormats: ImportFormat[] = [
    'application/lottie+json',
    'application/dotlottie',
  ]

  /** Borrow a metadata port; default owns local limits, app injects its ledger. */
  constructor(private readonly metadata: LottieMetadataLoader = new LottieMetadataReader()) { super() }

  /** Bounded preflight; resource/container failures reject instead of returning
   * a misleading empty summary. Missing/invalid JSON remains nullable metadata. */
  async preflight(file: File, _options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    checkImportExecution(execution)
    const source = this.makeSource(file)
    const format = this.getFormat(file)

    const manifest = await this.metadata.read(file, format === 'application/dotlottie' ? 'dotlottie' : 'json', execution)
    checkImportExecution(execution)

    const features: string[] = []
    if (manifest) {
      if (manifest.w && manifest.h) features.push(`${manifest.w}×${manifest.h} px`)
      if (manifest.fr) features.push(`${manifest.fr} fps`)
      const dur = manifest.durationMs
      if (dur > 0) features.push(`${(dur / 1000).toFixed(2)} s`)
      if (manifest.layerCount) features.push(`${manifest.layerCount} layer(s)`)
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

  /** Store the original editable-source asset after bounded metadata parsing.
   * Abort/resource failures create no source or successful import result. */
  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    checkImportExecution(execution)
    const startMs = Date.now()
    const format  = this.getFormat(file)
    this.reportProgress(onProgress, 'reading', 'Reading Lottie…', 0.1)

    if (format === 'application/dotlottie') this.reportProgress(onProgress, 'parsing', 'Unpacking dotLottie…', 0.4)
    checkImportExecution(execution)
    const manifest = await this.metadata.read(file, format === 'application/dotlottie' ? 'dotlottie' : 'json', execution)
    checkImportExecution(execution)

    this.reportProgress(onProgress, 'converting', 'Creating asset…', 0.7)
    checkImportExecution(execution)

    return withImportSource(file, async (url) => {
      const assetId    = this.generateAssetId()
      const durationMs = manifest ? manifest.durationMs : 0
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
      checkImportExecution(execution)

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
    })
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
