import { cancelledJobError } from '../../resources/jobs'
import type { VisualDecoder, VisualResource } from './types'

/** Browser drawing adapter. Owner admits headers/pixels before invocation.
 * Modern image ready follows Image.decode's actual promise settlement, including
 * src-reset cancellation; an early abort never drops a still-pending decode.
 * Video admits metadata before switching from metadata to first-frame preload.
 * Browser codec/driver internals are opaque, not a guaranteed physical RAM cap.
 * Owner disposes failed/stale handles; no source/cache/transport clock is owned.
 * https://html.spec.whatwg.org/multipage/embedded-content.html#dom-img-decode */
export const browserVisualDecoder: VisualDecoder = (input, signal): VisualResource => {
  const video = input.kind === 'video' ? document.createElement('video') : null
  const image = video ? null : new Image(), element = video ?? image!
  let settled = false, decoding = false, stopError: Error | undefined
  let resolve!: () => void, reject!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined
  const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  /** Detach before reset so synchronous browser events cannot publish twice. */
  const finish = (error?: Error) => {
    if (settled) return
    settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
    element.onload = null; element.onerror = null
    if (video) { video.onloadeddata = null; video.onloadedmetadata = null }
    error ? reject(error) : resolve()
  }
  /** Image.decode is not raced: request src reset, retain ownership until its
   * actual promise rejects/resolves. Event-only legacy adapters have no such promise. */
  const stop = (error: Error) => {
    stopError ??= error
    if (image && decoding) {
      try { image.removeAttribute('src') } catch (failure) { stopError = failure instanceof Error ? failure : new Error(String(failure)) }
    } else finish(stopError)
  }
  const abort = () => stop(cancelledJobError())
  const dimensions = () => {
    const width = video ? video.videoWidth : image!.naturalWidth, height = video ? video.videoHeight : image!.naturalHeight
    if (!(width > 0 && height > 0)) throw new Error('Visual media has no drawable dimensions.')
    input.admitFrame?.(width, height)
  }
  const loaded = () => {
    if (stopError) { finish(stopError); return }
    try { dimensions(); finish() } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
  }
  const resource: VisualResource = {
    element, ready,
    get width() { return video ? video.videoWidth : image!.naturalWidth },
    get height() { return video ? video.videoHeight : image!.naturalHeight },
    dispose() {
      stop(cancelledJobError())
      if (video) video.pause()
      element.removeAttribute('src')
      if (video) video.load()
    },
  }
  if (signal.aborted) { abort(); return resource }
  signal.addEventListener('abort', abort, { once: true })
  element.onerror = () => stop(new Error('Visual media failed to load (check source and CORS).'))
  if (video) {
    video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.onloadeddata = loaded
    video.onloadedmetadata = () => {
      try { dimensions(); video.preload = 'auto' } catch (error) { stop(error instanceof Error ? error : new Error(String(error))) }
    }
  } else { image!.decoding = 'async'; if (typeof image!.decode !== 'function') image!.onload = loaded }
  element.crossOrigin = 'anonymous'
  timer = setTimeout(() => { const error = new Error('Visual media readiness timed out.'); error.name = 'TimeoutError'; stop(error) }, 15000)
  try {
    element.src = input.url
    if (video) video.load()
    else if (typeof image!.decode === 'function') {
      decoding = true
      const done = () => { decoding = false; loaded() }
      const failed = (error: unknown) => { decoding = false; finish(stopError ?? (error instanceof Error ? error : new Error(String(error)))) }
      image!.decode().then(done, failed)
    }
  } catch (error) { decoding = false; finish(error instanceof Error ? error : new Error(String(error))) }
  return resource
}
