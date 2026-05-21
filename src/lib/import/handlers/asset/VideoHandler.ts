// ── VideoHandler ───────────────────────────────────────────────────────────────
//
// Handles MP4, MOV, WEBM, AVI imports.
// Creates one VideoAsset + one VideoLayer.

import { BaseImportHandler } from '../BaseHandler'
import { newVideoLayer }     from '../../../defaults'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress } from '../../types'
import type { Asset } from '../../../asset/types'

export class VideoHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = [
    'video/mp4',
    'video/mov',   // QuickTime / MOV (canonical internal format)
    'video/webm',
  ]

  async preflight(file: File): Promise<ImportPreflight> {
    const { width, height, durationMs } = await this.probeVideo(file)
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
        estimatedMemoryBytes: width * height * 4 * 30 * durationSec, // rough: 30fps RGBA
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

  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading video…', 0.1)

    const url      = URL.createObjectURL(file)
    const { width, height, durationMs } = await this.probeVideo(file)
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
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private probeVideo(file: File): Promise<{ width: number; height: number; durationMs: number }> {
    return new Promise((resolve, reject) => {
      const url   = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.preload  = 'metadata'
      video.muted    = true

      const cleanup = () => {
        URL.revokeObjectURL(url)
        video.removeAttribute('src')
        video.load()
      }

      video.onloadedmetadata = () => {
        const width      = video.videoWidth  || 0
        const height     = video.videoHeight || 0
        const durationMs = isFinite(video.duration) ? Math.round(video.duration * 1000) : 0
        cleanup()
        resolve({ width, height, durationMs })
      }
      video.onerror = () => {
        cleanup()
        reject(new Error(`Failed to probe video: ${file.name}`))
      }
      video.src = url
    })
  }

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
