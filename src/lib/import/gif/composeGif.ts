import { checkImportExecution, type ImportExecution } from '../resources/ImportExecution'
import type { DecodedGifSheet, GifLimits, GifSheetPlan } from './types'

/** Narrow native ports keep one shared frame-loop for window and worker. */
export interface GifFrame {
  readonly displayWidth: number; readonly displayHeight: number
  readonly codedWidth: number; readonly codedHeight: number; readonly duration: number | null
  close(): void
}
export interface GifFrameDecoder<F extends GifFrame = VideoFrame> {
  readonly ready: Promise<number>
  decode(index: number): Promise<F>
  close(): void
}
export interface GifSurface<F extends GifFrame = VideoFrame> {
  draw(frame: F, x: number, y: number): void
  encode(): Promise<Blob>
  dispose(): void
}
export interface GifPlatform<F extends GifFrame = VideoFrame> {
  open(buffer: ArrayBuffer): GifFrameDecoder<F>
  surface(width: number, height: number): GifSurface<F>
}

/** Compose complete native frames sequentially; at most ONE returned VideoFrame
 * is held. Every frame closes even on draw/mismatch/abort errors. Decoder closes
 * before PNG encode; canvas is zero-sized in finally after actual encode settles.
 * The caller admits input+codec-copy+frame+canvas+output policy BEFORE calling.
 * Abort is checked after awaited native work, never pretending completion early.
 * Native codec internally retained frames/driver copies are not measurable here.
 * Durations remain averaged in ms, matching existing GIF playback semantics. */
export async function composeGif<F extends GifFrame>(buffer: ArrayBuffer, plan: GifSheetPlan, limits: GifLimits, platform: GifPlatform<F>, execution?: ImportExecution): Promise<DecodedGifSheet> {
  checkImportExecution(execution)
  let decoder: GifFrameDecoder<F> | undefined, surface: GifSurface<F> | undefined
  try {
    decoder = platform.open(buffer)
    const count = await decoder.ready; checkImportExecution(execution)
    if (count !== plan.frameCount) throw new Error('GIF native frame count differs from validated metadata.')
    surface = platform.surface(plan.sheetWidth, plan.sheetHeight)
    let durationUs = 0
    for (let i = 0; i < plan.frameCount; i++) {
      checkImportExecution(execution)
      const frame = await decoder.decode(i)
      try {
        checkImportExecution(execution)
        if (frame.displayWidth !== plan.width || frame.displayHeight !== plan.height) throw new Error('GIF native dimensions differ from validated metadata.')
        if (frame.codedWidth * frame.codedHeight * 4 > limits.maxFrameBytes) throw new RangeError('GIF native frame exceeds the admitted pixel policy.')
        surface.draw(frame, (i % plan.columns) * plan.width, Math.floor(i / plan.columns) * plan.height)
        durationUs += frame.duration ?? 0
      } finally { frame.close() }
    }
    decoder.close(); decoder = undefined
    checkImportExecution(execution)
    const blob = await surface.encode(); checkImportExecution(execution)
    if (!blob.size || blob.size > limits.maxOutputBytes || blob.size > plan.encodeReserveBytes) throw new RangeError('GIF encoded sheet exceeds its admitted output byte limit.')
    return { blob, sheetWidth: plan.sheetWidth, sheetHeight: plan.sheetHeight,
      frameWidth: plan.width, frameHeight: plan.height, frameCount: plan.frameCount,
      columns: plan.columns, rows: plan.rows, avgFrameMs: durationUs > 0 ? durationUs / 1000 / plan.frameCount : 100 }
  } finally { try { decoder?.close() } finally { surface?.dispose() } }
}
