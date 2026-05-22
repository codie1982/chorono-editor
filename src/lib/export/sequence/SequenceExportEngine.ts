// ── SequenceExportEngine ──────────────────────────────────────────────────────
//
// BL-83 — renders a frame range to an image sequence and packages it as a ZIP.
// Reuses RasterExportEngine per frame (BL-80) so each frame matches the editor,
// then stores them with ZipWriter (no extra dependency). Useful for compositing
// pipelines (After Effects / DaVinci / Nuke) that ingest numbered frames.

import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import { exportRasterImage, type RasterBackground } from '../raster/RasterExportEngine'
import { RASTER_EXTENSION, type RasterFormat } from '../raster/ImageEncoders'
import { ZipWriter } from './ZipWriter'

export interface SequenceExportOptions {
  /** Per-frame image codec. */
  format: RasterFormat
  /** Frames per second to sample the timeline at. Default = composition.frameRate. */
  fps?: number
  /** Resolution multiplier per frame. Default 1. */
  scale?: number
  /** Background fill. Default 'scene'. */
  background?: RasterBackground
  /** Lossy quality 0–1 (webp/jpeg). Default 0.92. */
  quality?: number
  /**
   * Frame filename pattern. `#` runs are replaced by the zero-padded frame
   * index (1-based). Default 'frame_####'. The extension is appended
   * automatically from the format.
   */
  pattern?: string
}

export interface SequenceExportResult {
  blob: Blob
  filename: string
  frameCount: number
  warnings: string[]
}

export type SequenceProgress = (frame: number, total: number) => void

/** Replace the first run of '#' with a zero-padded number; ensure min width. */
function formatFrameName(pattern: string, index: number, minPad: number): string {
  const match = pattern.match(/#+/)
  const pad = Math.max(minPad, match ? match[0].length : 0)
  const numStr = String(index).padStart(pad, '0')
  return match ? pattern.replace(/#+/, numStr) : `${pattern}${numStr}`
}

/**
 * Render the composition to an image sequence ZIP. Frames are sampled at `fps`
 * across [0, composition.durationMs]. Progress is reported per frame.
 */
export async function exportSequence(
  scene: ChronoScene,
  assets: AssetElementMap,
  opts: SequenceExportOptions,
  onProgress?: SequenceProgress,
): Promise<SequenceExportResult> {
  const { composition } = scene
  const fps = Math.max(1, opts.fps ?? composition.frameRate ?? 30)
  const durationMs = Math.max(0, composition.durationMs)
  const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps))
  const ext = RASTER_EXTENSION[opts.format]
  const pattern = opts.pattern ?? 'frame_####'
  const minPad = String(frameCount).length

  const zip = new ZipWriter()
  let warnings: string[] = []

  for (let i = 0; i < frameCount; i++) {
    const timeMs = (i / fps) * 1000
    const result = await exportRasterImage(scene, assets, {
      format: opts.format,
      timeMs,
      scale: opts.scale,
      background: opts.background,
      quality: opts.quality,
    })
    // Collect warnings once (identical across frames).
    if (i === 0) warnings = result.warnings
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    zip.add(`${formatFrameName(pattern, i + 1, minPad)}.${ext}`, bytes)
    onProgress?.(i + 1, frameCount)
  }

  const blob = zip.finish()
  const sceneName = composition.id || 'scene'
  return {
    blob,
    filename: `${sceneName}_sequence_${opts.format}.zip`,
    frameCount,
    warnings,
  }
}
