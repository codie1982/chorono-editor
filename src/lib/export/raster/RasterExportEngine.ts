// ── RasterExportEngine ────────────────────────────────────────────────────────
//
// BL-80 — renders a single frame of a scene to a PNG / WEBP / JPEG Blob.
//
// Pipeline:
//   1. Render the scene at composition resolution to a base canvas using the
//      shared CanvasRenderer in 'preview' mode (BL-66 → no editor chrome).
//   2. If scale > 1, blit the base onto a larger output canvas with high-quality
//      smoothing (resolution multiplier).
//   3. Encode the output canvas to the requested format.
//
// Runs fully client-side — no server round-trip. The same CanvasRenderer the
// editor uses guarantees the export matches the on-screen result pixel-for-pixel.

import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import type { ParamValueMap } from '@/lib/render/RenderContext'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import {
  encodeCanvas,
  RASTER_EXTENSION,
  RASTER_SUPPORTS_ALPHA,
  type RasterFormat,
} from './ImageEncoders'

export type RasterBackground = 'scene' | 'transparent' | { color: string }

export interface RasterExportOptions {
  /** Output codec. */
  format: RasterFormat
  /** Frame to capture (ms on the global timeline). Default 0. */
  timeMs?: number
  /** Resolution multiplier — 1 = composition size, 2 = 2×, etc. Default 1. */
  scale?: number
  /** Background fill. Default 'scene' (composition.backgroundColor). */
  background?: RasterBackground
  /** Lossy quality 0–1 for webp / jpeg. Ignored for png. Default 0.92. */
  quality?: number
  /** Runtime parameter values for text / colour resolution. */
  paramValues?: ParamValueMap
}

export interface RasterExportResult {
  blob: Blob
  width: number
  height: number
  /** Suggested download filename (without forcing it on the caller). */
  filename: string
  /** Non-fatal advisories (e.g. transparency dropped for JPEG). */
  warnings: string[]
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

/**
 * Render one frame of `scene` to a raster Blob. Throws if the canvas 2D context
 * cannot be acquired or the codec encode fails.
 */
export async function exportRasterImage(
  scene: ChronoScene,
  assets: AssetElementMap,
  opts: RasterExportOptions,
): Promise<RasterExportResult> {
  const { composition } = scene
  const timeMs   = opts.timeMs ?? 0
  const scale    = Math.max(1, opts.scale ?? 1)
  const quality  = opts.quality ?? 0.92
  const format   = opts.format
  const warnings: string[] = []

  // JPEG has no alpha — fall back to a white fill so the frame isn't black.
  let background = opts.background ?? 'scene'
  if (background === 'transparent' && !RASTER_SUPPORTS_ALPHA[format]) {
    background = { color: '#ffffff' }
    warnings.push(`${format.toUpperCase()} has no alpha channel — transparent background exported as white.`)
  }

  const baseW = composition.width
  const baseH = composition.height

  // 1. Render at composition resolution (preview mode → clean frame).
  const base = createCanvas(baseW, baseH)
  const baseCtx = base.getContext('2d')
  if (!baseCtx) throw new Error('RasterExport: failed to acquire 2D context')
  canvasRenderer.render(baseCtx, scene, timeMs, null, assets, {
    renderMode:  'preview',
    background,
    paramValues: opts.paramValues,
  })

  // 2. Optional upscale to the target resolution.
  const outW = Math.round(baseW * scale)
  const outH = Math.round(baseH * scale)
  let target: HTMLCanvasElement = base
  if (scale !== 1) {
    target = createCanvas(outW, outH)
    const tctx = target.getContext('2d')
    if (!tctx) throw new Error('RasterExport: failed to acquire scaled 2D context')
    tctx.imageSmoothingEnabled = true
    tctx.imageSmoothingQuality = 'high'
    tctx.drawImage(base, 0, 0, outW, outH)
  }

  // 3. Encode.
  const blob = await encodeCanvas(target, format, quality)
  const sceneName = composition.id || 'scene'
  const filename = `${sceneName}.${RASTER_EXTENSION[format]}`

  return { blob, width: outW, height: outH, filename, warnings }
}

/** Trigger a browser download for an exported Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
