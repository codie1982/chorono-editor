// Animated GIF imports use bounded metadata/native preparation. This handler
// only maps prepared media into existing editable asset/layer result contracts.

import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler } from '../BaseHandler'
import { GifImportService, type GifImportProvider, type DecodedGifSheet } from '../../gif'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { buildSpriteGrid } from '../../../frameSequence/spriteGrid'
import { newImageLayer, newFrameSequenceLayer } from '../../../defaults'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress, ImportWarning } from '../../types'
import type { Asset } from '../../../asset/types'

/** Scene/source result orchestration only. Preparation owns input, workers,
 * decoders and byte admission; existing withImportSource owns persistent URLs.
 * A prepared output is released after synchronous source adoption/discard. No
 * dense frames/native objects enter scene JSON, cloning or undo snapshots. */
export class GifHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['image/gif']

  /** The application injects its shared preparation executor and budget. */
  constructor(private readonly preparation: GifImportProvider = new GifImportService()) { super() }

  /** Header-only bounded preflight, with actual counts and no decoded frame. */
  async preflight(file: File, _options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const source = this.makeSource(file)
    const plan = await this.preparation.inspect(file, execution)
    const { width, height, frameCount } = plan
    const animated = frameCount > 1
    const features: string[] = []
    if (width && height) features.push(`${width}×${height}px`)
    features.push(animated ? `${frameCount} frames (animated)` : 'static GIF')

    return {
      source,
      format:  'image/gif',
      kind:    'asset',
      summary: {
        estimatedLayers:      1,
        estimatedAssets:      1,
        estimatedGroups:      0,
        estimatedTracks:      0,
        estimatedMemoryBytes: plan.frameBytes + plan.sheetBytes + plan.encodeReserveBytes + file.size * 2,
        detectedFeatures:     features,
        unsupportedFeatures:  [],
      },
      availableOptions: { centerInComposition: true, collection: true },
      defaultOptions:   { centerInComposition: true },
      warnings: !this.preparation.canAnimate
        ? ['Animated GIF decoding not supported in this browser — will import the first frame only']
        : [],
    }
  }

  /** Create one existing image/frameSequence result after admitted conversion.
   * Fatal decode/capacity/abort errors propagate without automatic re-decode. */
  async handle(file: File, _options?: ImportOptions, onProgress?: (p: ImportProgress) => void, execution?: ImportExecution): Promise<ImportResult> {
    checkImportExecution(execution)
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading GIF…', 0.1)
    checkImportExecution(execution)
    this.reportProgress(onProgress, 'parsing', 'Preparing GIF frames…', 0.3)
    const prepared = await this.preparation.prepare(file, execution)
    try {
      checkImportExecution(execution)
      const sheet = prepared.sheet
      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)
      return sheet ? this.buildSheetResult(file, sheet.blob, sheet, startMs)
        : this.staticImport(file, prepared.metadata, startMs)
    } finally { prepared.release() }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Build asset + frameSequence layer + ImportResult from a composited sheet. */
  private buildSheetResult(
    file: File,
    blob: Blob,
    grid: Omit<DecodedGifSheet, 'blob'>,
    startMs: number,
  ): ImportResult {
    return withImportSource(blob, (url): ImportResult => {
      const assetId = this.generateAssetId()
      const fps     = Math.max(1, Math.round(1000 / grid.avgFrameMs))

      const asset: Asset = {
        id:        assetId,
        name:      file.name,
        type:      'spriteSheet',
        url,
        width:     grid.sheetWidth,
        height:    grid.sheetHeight,
        frameRate: fps,
        storage:   { mode: 'external', originalFileName: file.name },
        metadata: {
          filesize:   file.size,
          importedAt: Date.now(),
          sourceApp:  'GIF',
          tags:       [],
          notes:      `${grid.frameCount} frames @ ${fps}fps`,
        },
        runtime: { objectUrl: url },
      }

      const seq = buildSpriteGrid(assetId, { imageWidth: grid.sheetWidth, imageHeight: grid.sheetHeight,
        columns: grid.columns, rows: grid.rows, frameCount: grid.frameCount, fps, loop: true })
      const layer = newFrameSequenceLayer(seq, grid.frameWidth, grid.frameHeight)

      return {
        id:      this.generateId(),
        source:  this.makeSource(file),
        format:  'image/gif',
        kind:    'asset',
        assets:  [asset],
        layers:  [layer],
        groups:  [],
        tracks:  [],
        timelines: [],
        commands:  [],
        warnings:  [],
        errors:             [],
        unsupportedFeatures: [],
        report: {
          title:          'Animated GIF Import',
          sourceFileName: file.name,
          format:         'image/gif',
          created:        { assets: 1, layers: 1, groups: 0, tracks: 0, compositions: 0 },
          warnings:       [],
          errors:         [],
          unsupportedFeatures: [],
          suggestions:    [`Imported as a ${grid.frameCount}-frame sprite sequence @ ${fps}fps — adjust FPS/loop in the layer properties.`],
          durationMs:     Date.now() - startMs,
        },
      }
    })
  }

  /** Static image fallback (same shape as ImageHandler output). */
  private staticImport(
    file: File,
    { width, height }: { width: number; height: number },
    startMs: number,
  ): ImportResult {
    return withImportSource(file, (url): ImportResult => {
      const assetId = this.generateAssetId()

      const asset: Asset = {
        id:     assetId,
        name:   file.name,
        type:   'image',
        url,
        width,
        height,
        storage:  { mode: 'external', originalFileName: file.name },
        metadata: { filesize: file.size, importedAt: Date.now(), tags: [] },
        runtime:  { objectUrl: url },
      }
      const layer = newImageLayer(assetId, width, height)

      const warnings: ImportWarning[] = [{
        code: 'unsupported_feature', severity: 'info',
        message: 'Imported GIF as a single still frame',
      }]

      return {
        id:      this.generateId(),
        source:  this.makeSource(file),
        format:  'image/gif',
        kind:    'asset',
        assets:  [asset],
        layers:  [layer],
        groups:  [],
        tracks:  [],
        timelines: [],
        commands:  [],
        warnings,
        errors:             [],
        unsupportedFeatures: [],
        report: {
          title:          'GIF Import (static)',
          sourceFileName: file.name,
          format:         'image/gif',
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

}
