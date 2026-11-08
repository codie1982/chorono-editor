// ── SpriteSheetHandler (BL-07b) ───────────────────────────────────────────────
//
// Imports an image as a sprite sheet → 1 spriteSheet asset + 1 frameSequence
// layer. Unlike GIF, a bare image carries no frame metadata, so the grid
// (columns/rows/fps) must come from SpriteImportOptions — supplied by the
// SpriteSheet import modal, not by auto-detection.
//
// Output is a single asset + single layer → an 'asset' import.

import type { MediaProbeSource } from '../../../asset/metadata'
import { editorMediaProbes } from '../../../asset/metadata/editorMediaProbes'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler } from '../BaseHandler'
import { newFrameSequenceLayer } from '../../../defaults'
import { buildSpriteGrid } from '../../../frameSequence/spriteGrid'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress, SpriteImportOptions } from '../../types'
import type { Asset } from '../../../asset/types'

function isSpriteOptions(o: ImportOptions | undefined): o is SpriteImportOptions {
  return !!o && typeof (o as SpriteImportOptions).columns === 'number'
}

/** Import orchestration borrows the shared probe owner; native handles, byte
 * reservations and cancellation never enter asset/scene/undo JSON. */
export class SpriteSheetHandler extends BaseImportHandler {
  /** Private hosts can inject a narrow probe port without constructing DOM media. */
  constructor(private readonly probes: MediaProbeSource = editorMediaProbes) { super() }

  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['image/spritesheet']

  /** Probe source metadata within bounded shared capacity, without retaining a native handle. */
  async preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const { width, height } = await this.probes.image(file, execution)
    const grid = buildSpriteGrid('preflight', { imageWidth: width, imageHeight: height,
      columns: isSpriteOptions(options) ? options.columns : 1, rows: isSpriteOptions(options) ? options.rows : 1 })
    const cols = grid.columns, rows = grid.rows, frames = grid.frameCount

    return {
      source: this.makeSource(file),
      format: 'image/spritesheet',
      kind:   'asset',
      summary: {
        estimatedLayers:      1,
        estimatedAssets:      1,
        estimatedGroups:      0,
        estimatedTracks:      0,
        estimatedMemoryBytes: width * height * 4,
        detectedFeatures:     [`${width}×${height}px`, `${cols}×${rows} grid (${frames} frames)`],
        unsupportedFeatures:  [],
      },
      availableOptions: { collection: true },
      defaultOptions:   {},
      warnings: [],
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
    this.reportProgress(onProgress, 'reading', 'Reading sprite sheet…', 0.2)

    if (!isSpriteOptions(options)) {
      throw new Error('Sprite sheet import requires grid options (columns, rows)')
    }

    const { width, height } = await this.probes.image(file, execution)
    checkImportExecution(execution)
    return withImportSource(file, async (url) => {
      const assetId = this.generateAssetId()

      this.reportProgress(onProgress, 'converting', 'Building frame sequence…', 0.7)

      const seq = buildSpriteGrid(assetId, {
        imageWidth:  width,
        imageHeight: height,
        columns:     options.columns,
        rows:        options.rows,
        frameCount:  options.frameCount,
        fps:         options.fps,
        loop:        options.loop,
      })

      const asset: Asset = {
        id:        assetId,
        name:      file.name,
        type:      'spriteSheet',
        url,
        width,
        height,
        frameRate: seq.fps,
        storage:   { mode: 'external', originalFileName: file.name },
        metadata: {
          filesize:   file.size,
          importedAt: Date.now(),
          tags:       [],
          notes:      `${seq.frameCount} frames · ${seq.columns}×${seq.rows} grid @ ${seq.fps}fps`,
        },
        runtime: { objectUrl: url },
      }

      const layer = newFrameSequenceLayer(seq, seq.frameWidth, seq.frameHeight)

      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)

      return {
        id:      this.generateId(),
        source:  this.makeSource(file),
        format:  'image/spritesheet',
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
          title:          'Sprite Sheet Import',
          sourceFileName: file.name,
          format:         'image/spritesheet',
          created:        { assets: 1, layers: 1, groups: 0, tracks: 0, compositions: 0 },
          warnings:       [],
          errors:         [],
          unsupportedFeatures: [],
          suggestions:    [`Imported ${seq.frameCount}-frame sequence @ ${seq.fps}fps — adjust FPS/loop in the layer properties.`],
          durationMs:     Date.now() - startMs,
        },
      }
    })
  }

  // ── Private ────────────────────────────────────────────────────────────────


}
