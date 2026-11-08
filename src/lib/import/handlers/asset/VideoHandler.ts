// ── VideoHandler ───────────────────────────────────────────────────────────────
//
// Handles MP4, MOV, WEBM, AVI imports.
// Creates one VideoAsset + one VideoLayer.

import type { MediaProbeSource } from '../../../asset/metadata'
import { editorMediaProbes } from '../../../asset/metadata/editorMediaProbes'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler } from '../BaseHandler'
import { newVideoLayer }     from '../../../defaults'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress } from '../../types'
import type { Asset } from '../../../asset/types'

/** Import orchestration borrows the shared probe owner; native handles, byte
 * reservations and cancellation never enter asset/scene/undo JSON. */
export class VideoHandler extends BaseImportHandler {
  /** Private hosts can inject a narrow probe port without constructing DOM media. */
  constructor(private readonly probes: MediaProbeSource = editorMediaProbes) { super() }

  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = [
    'video/mp4',
    'video/mov',   // QuickTime / MOV (canonical internal format)
    'video/webm',
  ]

  /** Probe source metadata within bounded shared capacity, without retaining a native handle. */
  async preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const { width, height, durationMs } = await this.probes.video(file, execution)
    const source = this.makeSource(file)
    const format = this.getFormat(file)

    const durationSec = durationMs / 1000
    const features: string[] = [`${width}×${height}px`]
    if (durationMs > 0) features.push(`${durationSec.toFixed(1)}s`)

    return {
      source,
      format,
      kind:    'asset',
      summary: {
        estimatedLayers:      1,
        estimatedAssets:      1,
        estimatedGroups:      0,
        estimatedTracks:      0,
        estimatedMemoryBytes: width * height * 4, // one display frame; native decoder internals are opaque
        detectedFeatures:     features,
        unsupportedFeatures:  [],
      },
      availableOptions: {
        centerInComposition: true,
        scale: true,
        collection: true,
      },
      defaultOptions:  { centerInComposition: true },
      warnings:        file.size > 100_000_000 ? ['Very large file — consider compressing before import'] : [],
    }
  }

  /** Validate/probe before creator source adoption; caller owns final result publication. */
  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading video…', 0.1)

    const { width, height, durationMs } = await this.probes.video(file, execution)
    checkImportExecution(execution)
    return withImportSource(file, async (url) => {
      const assetId  = this.generateAssetId()
      const format   = this.getFormat(file)

      this.reportProgress(onProgress, 'converting', 'Creating layer…', 0.7)

      const asset: Asset = {
        id:         assetId,
        name:       file.name,
        type:       'video',
        url,
        width,
        height,
        durationMs: durationMs > 0 ? durationMs : undefined,
        storage:  { mode: 'external', originalFileName: file.name },
        metadata: {
          filesize:   file.size,
          importedAt: Date.now(),
          tags:       [],
        },
        runtime: { objectUrl: url },
      }

      const layer = newVideoLayer(assetId, width, height, durationMs > 0 ? durationMs : undefined)

      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)

      const warnings = file.size > 100_000_000
        ? [{ code: 'large_file' as const, severity: 'info' as const, message: `Large video (${(file.size / 1024 / 1024).toFixed(0)} MB)` }]
        : []

      return {
        id:      this.generateId(),
        source:  this.makeSource(file),
        format,
        kind:    'asset',
        assets:  [asset],
        layers:  [layer],
        groups:  [],
        tracks:  [],
        timelines: [],
        commands: [],
        warnings,
        errors:             [],
        unsupportedFeatures: [],
        report: {
          title:          'Video Import',
          sourceFileName: file.name,
          format,
          created:        { assets: 1, layers: 1, groups: 0, tracks: 0, compositions: 0 },
          warnings:       [],
          errors:         [],
          unsupportedFeatures: [],
          suggestions:    [],
          durationMs:     Date.now() - startMs,
        },
      }
    })
  }

  // ── Private ────────────────────────────────────────────────────────────────


  private getFormat(file: File): ImportFormat {
    const mime = file.type.toLowerCase()
    if (mime === 'video/mp4')       return 'video/mp4'
    if (mime === 'video/quicktime') return 'video/mov'   // browser MIME → canonical
    if (mime === 'video/webm')      return 'video/webm'
    // Fallback by extension
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.mov'))  return 'video/mov'
    if (lower.endsWith('.webm')) return 'video/webm'
    return 'video/mp4'
  }
}
