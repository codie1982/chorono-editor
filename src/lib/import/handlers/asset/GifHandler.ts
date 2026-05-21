// ── GifHandler (BL-07) ────────────────────────────────────────────────────────
//
// Animated GIF → sprite sheet + frameSequence layer (editable playback).
// Static GIF → plain image asset + image layer (same as ImageHandler).
//
// Decoding uses the browser ImageDecoder (WebCodecs). When it is unavailable
// (e.g. Firefox) or decoding fails, we fall back to a static image import so
// the GIF still lands in the scene as its first frame.
//
// Output is a SINGLE asset + SINGLE layer, so this is an 'asset' import.

import { BaseImportHandler } from '../BaseHandler'
import { newImageLayer, newFrameSequenceLayer } from '../../../defaults'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress, ImportWarning } from '../../types'
import type { Asset } from '../../../asset/types'
import type { FrameSequenceData } from '../../../types/media'

interface DecodedGif {
  frames: VideoFrame[]
  width: number
  height: number
  /** Average frame duration in ms (fallback 100ms ≈ 10fps). */
  avgFrameMs: number
}

export class GifHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['image/gif']

  async preflight(file: File): Promise<ImportPreflight> {
    const source = this.makeSource(file)
    let frameCount = 1
    let width = 0, height = 0
    try {
      const probe = await this.probeFrameCount(file)
      frameCount = probe.frameCount
      width = probe.width
      height = probe.height
    } catch { /* fall back to static */ }

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
        estimatedMemoryBytes: width * height * 4 * Math.max(1, frameCount),
        detectedFeatures:     features,
        unsupportedFeatures:  [],
      },
      availableOptions: { centerInComposition: true, collection: true },
      defaultOptions:   { centerInComposition: true },
      warnings: typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder === 'undefined'
        ? ['Animated GIF decoding not supported in this browser — will import the first frame only']
        : [],
    }
  }

  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading GIF…', 0.1)

    let decoded: DecodedGif | null = null
    if (typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder !== 'undefined') {
      try {
        this.reportProgress(onProgress, 'parsing', 'Decoding frames…', 0.3)
        decoded = await this.decodeGif(file)
      } catch (err) {
        console.warn('[GifHandler] decode failed, falling back to static:', err)
      }
    }

    // Static GIF (or decode unavailable/failed) → plain image import.
    if (!decoded || decoded.frames.length <= 1) {
      decoded?.frames.forEach(f => f.close())
      return this.staticImport(file, startMs, onProgress)
    }

    this.reportProgress(onProgress, 'converting', 'Building sprite sheet…', 0.7)
    const sheet = this.compositeSpriteSheet(decoded)
    decoded.frames.forEach(f => f.close())

    const blob = await new Promise<Blob | null>(resolve =>
      sheet.canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      return this.staticImport(file, startMs, onProgress)
    }

    const url     = URL.createObjectURL(blob)
    const assetId = this.generateAssetId()
    const fps     = Math.max(1, Math.round(1000 / decoded.avgFrameMs))

    const asset: Asset = {
      id:     assetId,
      name:   file.name,
      type:   'spriteSheet',
      url,
      width:  sheet.sheetWidth,
      height: sheet.sheetHeight,
      frameRate: fps,
      storage:  { mode: 'external', originalFileName: file.name },
      metadata: {
        filesize:   file.size,
        importedAt: Date.now(),
        sourceApp:  'GIF',
        tags:       [],
        notes:      `${sheet.frameCount} frames @ ${fps}fps`,
      },
      runtime: { objectUrl: url },
    }

    const seq: FrameSequenceData = {
      assetId,
      columns:     sheet.columns,
      rows:        sheet.rows,
      frameCount:  sheet.frameCount,
      frameWidth:  decoded.width,
      frameHeight: decoded.height,
      fps,
      loop:        true,
      objectFit:   'contain',
    }
    const layer = newFrameSequenceLayer(seq, decoded.width, decoded.height)

    this.reportProgress(onProgress, 'complete', 'Done', 1)

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
        suggestions:    [`Imported as a ${sheet.frameCount}-frame sprite sequence @ ${fps}fps — adjust FPS/loop in the layer properties.`],
        durationMs:     Date.now() - startMs,
      },
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async decodeGif(file: File): Promise<DecodedGif> {
    const buffer = await file.arrayBuffer()
    const decoder = new ImageDecoder({ data: buffer, type: 'image/gif' })
    await decoder.tracks.ready
    const track = decoder.tracks.selectedTrack
    const frameCount: number = track?.frameCount ?? 1

    const frames: VideoFrame[] = []
    let totalDurationUs = 0
    for (let i = 0; i < frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      frames.push(image)
      totalDurationUs += (image.duration ?? 0)
    }

    const width  = frames[0]?.displayWidth  ?? frames[0]?.codedWidth  ?? 0
    const height = frames[0]?.displayHeight ?? frames[0]?.codedHeight ?? 0
    // duration is in microseconds; default to 100ms/frame if missing/zero
    const avgFrameMs = totalDurationUs > 0
      ? (totalDurationUs / 1000) / frameCount
      : 100

    decoder.close?.()
    return { frames, width, height, avgFrameMs }
  }

  private compositeSpriteSheet(decoded: DecodedGif): {
    canvas: HTMLCanvasElement
    columns: number
    rows: number
    frameCount: number
    sheetWidth: number
    sheetHeight: number
  } {
    const frameCount = decoded.frames.length
    const columns = Math.ceil(Math.sqrt(frameCount))
    const rows    = Math.ceil(frameCount / columns)
    const sheetWidth  = columns * decoded.width
    const sheetHeight = rows * decoded.height

    const canvas = document.createElement('canvas')
    canvas.width  = sheetWidth
    canvas.height = sheetHeight
    const ctx = canvas.getContext('2d')!

    decoded.frames.forEach((frame, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      ctx.drawImage(frame, col * decoded.width, row * decoded.height, decoded.width, decoded.height)
    })

    return { canvas, columns, rows, frameCount, sheetWidth, sheetHeight }
  }

  /** Probe frame count + dimensions without keeping decoded frames. */
  private async probeFrameCount(file: File): Promise<{ frameCount: number; width: number; height: number }> {
    if (typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder === 'undefined') {
      const dims = await this.probeImageDims(file)
      return { frameCount: 1, ...dims }
    }
    const buffer = await file.arrayBuffer()
    const decoder = new ImageDecoder({ data: buffer, type: 'image/gif' })
    await decoder.tracks.ready
    const track = decoder.tracks.selectedTrack
    const frameCount: number = track?.frameCount ?? 1
    // Decode frame 0 just for dimensions
    const { image } = await decoder.decode({ frameIndex: 0 })
    const width  = image.displayWidth  ?? image.codedWidth  ?? 0
    const height = image.displayHeight ?? image.codedHeight ?? 0
    image.close()
    decoder.close?.()
    return { frameCount, width, height }
  }

  /** Static image fallback (same shape as ImageHandler output). */
  private async staticImport(
    file: File,
    startMs: number,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const url = URL.createObjectURL(file)
    const { width, height } = await this.probeImageDims(file)
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

    this.reportProgress(onProgress, 'complete', 'Done', 1)
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
  }

  private probeImageDims(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load GIF: ${file.name}`)) }
      img.src = url
    })
  }
}
