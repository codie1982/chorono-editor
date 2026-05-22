/// <reference lib="webworker" />
// ── gifDecode.worker (BL-08b) ─────────────────────────────────────────────────
//
// Decodes an animated GIF into a sprite-sheet PNG OFF the main thread, so large
// GIFs never freeze the editor. Uses ImageDecoder + OffscreenCanvas — both
// available in the Worker scope (Chromium, Safari 17+). The main thread falls
// back to in-thread decoding when this worker is unavailable (e.g. Firefox).
//
// Protocol:
//   main → worker : { buffer: ArrayBuffer }            (buffer transferred)
//   worker → main : { ok: true, blob, ...grid } | { ok: false, error }

interface DecodeRequest { buffer: ArrayBuffer }

export interface GifWorkerResult {
  ok: true
  blob: Blob
  sheetWidth: number
  sheetHeight: number
  frameWidth: number
  frameHeight: number
  frameCount: number
  columns: number
  rows: number
  avgFrameMs: number
}
export interface GifWorkerError { ok: false; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  try {
    const { buffer } = e.data
    const decoder = new ImageDecoder({ data: buffer, type: 'image/gif' })
    await decoder.tracks.ready
    const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1

    const frames: VideoFrame[] = []
    let totalUs = 0
    for (let i = 0; i < frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      frames.push(image)
      totalUs += image.duration ?? 0
    }
    if (frames.length === 0) throw new Error('GIF produced no frames')

    const fw = frames[0].displayWidth  || frames[0].codedWidth
    const fh = frames[0].displayHeight || frames[0].codedHeight
    const columns = Math.ceil(Math.sqrt(frames.length))
    const rows    = Math.ceil(frames.length / columns)

    const canvas = new OffscreenCanvas(columns * fw, rows * fh)
    const c2d = canvas.getContext('2d')
    if (!c2d) throw new Error('OffscreenCanvas 2D context unavailable')
    frames.forEach((f, i) => {
      c2d.drawImage(f, (i % columns) * fw, Math.floor(i / columns) * fh, fw, fh)
      f.close()
    })
    decoder.close?.()

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const result: GifWorkerResult = {
      ok: true,
      blob,
      sheetWidth:  canvas.width,
      sheetHeight: canvas.height,
      frameWidth:  fw,
      frameHeight: fh,
      frameCount:  frames.length,
      columns,
      rows,
      avgFrameMs:  totalUs > 0 ? (totalUs / 1000) / frames.length : 100,
    }
    ctx.postMessage(result)
  } catch (err) {
    const out: GifWorkerError = { ok: false, error: (err as Error).message }
    ctx.postMessage(out)
  }
}

export {}
