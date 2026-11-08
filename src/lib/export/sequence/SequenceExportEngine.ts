// ── SequenceExportEngine ──────────────────────────────────────────────────────
//
// BL-83 — renders a frame range to an image sequence and packages it as a ZIP.
// Reuses RasterExportEngine per frame (BL-80) so each frame matches the editor,
// then stores them with ZipWriter (no extra dependency). Useful for compositing
// pipelines (After Effects / DaVinci / Nuke) that ingest numbered frames.

import { assetSourcePool } from '../../asset/sources'
import { VisualMediaSession } from '../../render/media/VisualMediaSession'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import type { RasterBackground } from '../raster/RasterExportEngine'
import {renderRasterFrame} from '../raster/renderRasterFrame'
import {editorOutputResources,type OutputResources,type OutputScope} from '../resources'
import type {ResourceLease} from '../../resources/residency'
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

/** Acquire a bounded sequence result. One outer output job owns all frames,
 * source/media pins and ZIP construction. Release the result after final use.
 * Raw legacy exportSequence remains a caller-owned compatibility handoff.
 */
export function acquireSequence(scene:ChronoScene,_assets:AssetElementMap,opts:SequenceExportOptions,
  execution:{signal?:AbortSignal;resources?:OutputResources;maxArchiveBytes?:number}={},onProgress?:SequenceProgress):Promise<ResourceLease<SequenceExportResult>>{
  return assetSourcePool.withAssets(scene.assets,()=>
    (execution.resources??editorOutputResources).run((scope,signal)=>renderSequenceOutput(scene,opts,scope,signal,onProgress,execution.maxArchiveBytes),execution))
}

/** Public in-scope step for composed output/transport jobs. Invoke only inside
 * an existing OutputResources job; scope owns the returned Blob through its
 * consumer/transport. This avoids recursive admission to the same output queue.
 * Sampling i*1000/fps and rounded frame count preserve the existing behavior.
 */
export async function renderSequenceOutput(scene:ChronoScene,opts:SequenceExportOptions,scope:OutputScope,
  signal?:AbortSignal,onProgress?:SequenceProgress,maxArchiveBytes=128*1024**2):Promise<SequenceExportResult>{
  scope.check(signal)
  const rawFps=opts.fps??scene.composition.frameRate??30,durationMs=scene.composition.durationMs
  if(!Number.isFinite(rawFps)||!Number.isFinite(durationMs)||durationMs<0)throw new RangeError('Invalid sequence frame rate/duration.')
  const fps=Math.max(1,rawFps),frameCount=Math.max(1,Math.round(durationMs/1000*fps)),pattern=opts.pattern??'frame_####'
  if(!Number.isSafeInteger(frameCount)||frameCount>4096)throw new RangeError('Sequence output exceeds the 4096-frame limit.')
  if(pattern.length>256)throw new RangeError('Sequence filename pattern exceeds 256 characters.')
  const ext=RASTER_EXTENSION[opts.format],minPad=String(frameCount).length
  const zip=new ZipWriter({scope,maxBytes:maxArchiveBytes}),media=new VisualMediaSession();media.start()
  let warnings:string[]=[]
  let archive:ResourceLease<Blob>|undefined
  try{
    for(let i=0;i<frameCount;i++){
      scope.check(signal)
      const frame=scope.child()
      try{
        const result=await renderRasterFrame(scene,{format:opts.format,timeMs:i/fps*1000,scale:opts.scale,
          background:opts.background,quality:opts.quality},frame,signal,media)
        if(i===0)warnings=result.warnings
        await zip.addBlob(`${formatFrameName(pattern,i+1,minPad)}.${ext}`,result.blob,signal)
      }finally{frame.dispose()}
      onProgress?.(i+1,frameCount);scope.check(signal)
    }
    scope.check(signal);archive=zip.finishOwned()
    const held=scope.adopt(archive);archive=undefined
    return {blob:held.value,filename:`${scene.composition.id||'scene'}_sequence_${opts.format}.zip`,frameCount,warnings}
  }finally{archive?.release();zip.dispose();media.stop()}
}

/** Legacy raw sequence Blob. Construction/queued work is bounded, but the final
 * returned raw Blob is caller-owned outside managed lifetime. Editor consumers
 * use acquireSequence; composed MCP jobs use renderSequenceOutput in their scope.
 */
export async function exportSequence(scene:ChronoScene,assets:AssetElementMap,opts:SequenceExportOptions,onProgress?:SequenceProgress):Promise<SequenceExportResult>{
  const lease=await acquireSequence(scene,assets,opts,{},onProgress)
  try{return lease.value}finally{lease.release()}
}
