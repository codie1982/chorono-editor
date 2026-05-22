// ── SpriteSheetHandler (BL-07b) ───────────────────────────────────────────────
//
// Imports an image as a sprite sheet → 1 spriteSheet asset + 1 frameSequence
// layer. Unlike GIF, a bare image carries no frame metadata, so the grid
// (columns/rows/fps) must come from SpriteImportOptions — supplied by the
// SpriteSheet import modal, not by auto-detection.
//
// Output is a single asset + single layer → an 'asset' import.

import { BaseImportHandler } from '../BaseHandler'
import { newFrameSequenceLayer } from '../../../defaults'
import { buildSpriteGrid } from '../../../frameSequence/spriteGrid'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress, SpriteImportOptions } from '../../types'
import type { Asset } from '../../../asset/types'

function isSpriteOptions(o: ImportOptions | undefined): o is SpriteImportOptions {
  return !!o && typeof (o as SpriteImportOptions).columns === 'number'
}

export class SpriteSheetHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['image/spritesheet']

  async preflight(file: File, options?: ImportOptions): Promise<ImportPreflight> {
    const { width, height } = await this.probeImageDims(file)
    const cols = isSpriteOptions(options) ? Math.max(1, Math.floor(options.columns)) : 1
    const rows = isSpriteOptions(options) ? Math.max(1, Math.floor(options.rows))    : 1
    const frames = cols * rows

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

  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading sprite sheet…', 0.2)

    if (!isSpriteOptions(options)) {
      throw new Error('Sprite sheet import requires grid options (columns, rows)')
    }

    const url = URL.createObjectURL(file)
    const { width, height } = await this.probeImageDims(file)
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
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private probeImageDims(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load image: ${file.name}`)) }
      img.src = url
    })
  }
}
