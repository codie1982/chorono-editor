// ── ImageHandler ──────────────────────────────────────────────────────────────
//
// Handles PNG, JPEG, WEBP, AVIF imports.
// Creates one ImageAsset + one ImageLayer.

import type { MediaProbeSource } from '../../../asset/metadata'
import { editorMediaProbes } from '../../../asset/metadata/editorMediaProbes'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler } from '../BaseHandler'
import { newImageLayer }     from '../../../defaults'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress } from '../../types'
import type { Asset } from '../../../asset/types'

/** Import orchestration borrows the shared probe owner; native handles, byte
 * reservations and cancellation never enter asset/scene/undo JSON. */
export class ImageHandler extends BaseImportHandler {
  /** Private hosts can inject a narrow probe port without constructing DOM media. */
  constructor(private readonly probes: MediaProbeSource = editorMediaProbes) { super() }

  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
    // image/gif handled by GifHandler (static → image, animated → frameSequence)
  ]

  /** Probe source metadata within bounded shared capacity, without retaining a native handle. */
  async preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const { width, height } = await this.probes.image(file, execution)
    const source = this.makeSource(file)
    return {
      source,
      format:  this.getFormat(file),
      kind:    'asset',
      summary: {
        estimatedLayers:      1,
        estimatedAssets:      1,
        estimatedGroups:      0,
        estimatedTracks:      0,
        estimatedMemoryBytes: width * height * 4,
        detectedFeatures:     [`${width}×${height}px`],
        unsupportedFeatures:  [],
      },
      availableOptions: {
        centerInComposition: true,
        scale: true,
        collection: true,
      },
      defaultOptions:  { centerInComposition: true },
      warnings:        file.size > 10_000_000 ? ['Large file — consider compressing before import'] : [],
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
    this.reportProgress(onProgress, 'reading', 'Reading image…', 0.1)

    const { width, height } = await this.probes.image(file, execution)
    checkImportExecution(execution)
    return withImportSource(file, async (url) => {
      const assetId    = this.generateAssetId()
      const format     = this.getFormat(file)

      this.reportProgress(onProgress, 'converting', 'Creating layer…', 0.7)

      const asset: Asset = {
        id:     assetId,
        name:   file.name,
        type:   'image',
        url,
        width,
        height,
        storage:  { mode: 'external', originalFileName: file.name },
        metadata: {
          filesize:   file.size,
          importedAt: Date.now(),
          tags:       [],
        },
        runtime: { objectUrl: url },
      }

      const layer = newImageLayer(assetId, width, height)

      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)

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
        warnings: file.size > 10_000_000 ? [{
          code:     'large_file',
          severity: 'info',
          message:  `Large image (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        }] : [],
        errors:             [],
        unsupportedFeatures: [],
        report: {
          title:          'Image Import',
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
    if (mime === 'image/jpeg') return 'image/jpeg'
    if (mime === 'image/webp') return 'image/webp'
    if (mime === 'image/avif') return 'image/avif'
    if (mime === 'image/gif')  return 'image/gif'
    return 'image/png'
  }
}
