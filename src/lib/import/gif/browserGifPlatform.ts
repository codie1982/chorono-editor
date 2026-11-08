import { composeGif, type GifPlatform } from './composeGif'
import { GifBackendUnavailable, type GifSheetComposer } from './types'

/** Native adapter shared by window/worker. Input is intentionally not detached:
 * ImageDecoder's encoded copy is admitted by the caller's withCopy scope. All
 * completed/ready promise rejections are observed immediately during setup.
 * Reference: https://www.w3.org/TR/webcodecs/#imagedecoder-interface */
export const browserGifPlatform: GifPlatform = {
  open(buffer) {
    if (typeof ImageDecoder === 'undefined') throw new GifBackendUnavailable('ImageDecoder is unavailable.')
    let decoder: ImageDecoder
    try { decoder = new ImageDecoder({ data: buffer, type: 'image/gif', preferAnimation: true }) }
    catch (error) { if (error instanceof Error && error.name === 'NotSupportedError') throw new GifBackendUnavailable(error.message); throw error }
    const ready = Promise.all([decoder.tracks.ready, decoder.completed]).then(() => decoder.tracks.selectedTrack?.frameCount ?? 0)
    void ready.catch(() => {})
    return { ready, decode: async index => (await decoder.decode({ frameIndex: index, completeFramesOnly: true })).image, close: () => decoder.close() }
  },
  surface(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height)
      let context: OffscreenCanvasRenderingContext2D | null
      try { context = canvas.getContext('2d') }
      catch (error) { canvas.width = canvas.height = 0; throw error }
      if (!context) { canvas.width = canvas.height = 0; throw new Error('GIF offscreen 2D context unavailable.') }
      return { draw: (frame, x, y) => context.drawImage(frame, x, y),
        encode: () => canvas.convertToBlob({ type: 'image/png' }), dispose: () => { canvas.width = canvas.height = 0 } }
    }
    if (typeof document === 'undefined') throw new GifBackendUnavailable('GIF canvas is unavailable.')
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    let context: CanvasRenderingContext2D | null
    try { context = canvas.getContext('2d') }
    catch (error) { canvas.width = canvas.height = 0; throw error }
    if (!context) { canvas.width = canvas.height = 0; throw new Error('GIF 2D context unavailable.') }
    return { draw: (frame, x, y) => context.drawImage(frame, x, y),
      encode: () => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('GIF PNG encoding failed.')), 'image/png')),
      dispose: () => { canvas.width = canvas.height = 0 } }
  },
}

/** Main-thread fallback uses the identical sequential ownership/frame algorithm.
 * It does not catch capacity/abort/decode errors or select another fallback. */
export const mainThreadGifComposer: GifSheetComposer = {
  compose: (buffer, plan, limits, execution) => composeGif(buffer, plan, limits, browserGifPlatform, execution),
}
