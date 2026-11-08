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
// editor uses shares preparation/drawing semantics; full output parity is verified separately.

import { assetSourcePool } from '../../asset/sources'
import type { VisualMediaSession } from '../../render/media/VisualMediaSession'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import type { ParamValueMap } from '@/lib/render/RenderContext'
import type { RasterFormat } from './ImageEncoders'
import type { ResourceLease } from '../../resources/residency'
import { editorOutputResources, type OutputResources } from '../resources'
import { renderRasterFrame } from './renderRasterFrame'

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

/** Acquire a budgeted raster result. Release after its final consumer has
 * finished; an independent download/transport pin may extend that lifetime.
 * Native encode always settles before cancellation frees surfaces/media pins.
 * Inject an output owner for private hosts; production shares the editor ledger.
 */
export function acquireRasterImage(
  scene: ChronoScene,
  _assets: AssetElementMap,
  opts: RasterExportOptions,
  execution: {signal?:AbortSignal;resources?:OutputResources} = {},
  mediaSession?: VisualMediaSession,
): Promise<ResourceLease<RasterExportResult>> {
  return assetSourcePool.withAssets(scene.assets, () =>
    (execution.resources ?? editorOutputResources).run((scope,signal) => renderRasterFrame(scene,opts,scope,signal,mediaSession),execution))
}

/** Legacy raw result handoff. Preparation/copies remain bounded, but a returned
 * raw Blob is caller-owned outside managed accounting. Application consumers
 * use acquireRasterImage and explicit release. Composition render/upscale/time
 * and warning semantics are unchanged; full export parity is a separate gate.
 */
export async function exportRasterImage(
  scene: ChronoScene,
  assets: AssetElementMap,
  opts: RasterExportOptions,
  mediaSession?: VisualMediaSession,
): Promise<RasterExportResult> {
  const result=await acquireRasterImage(scene,assets,opts,{},mediaSession)
  try{return result.value}finally{result.release()}
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
