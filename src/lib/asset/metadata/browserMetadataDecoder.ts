import { cancelledJobError } from '../../resources/jobs'
import type { MetadataDecoder, MediaInfo, NativeMetadataResource } from './types'

/** Expected unavailable duration/native metadata failure, distinct from budget,
 * cancellation and invalid dimensions. Audio import may preserve its historical
 * unknown-duration warning for this error only. */
export class MediaMetadataUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'MediaMetadataUnavailable' }
}

/** Metadata-only HTMLMediaElement adapter. No autoplay/PCM decode is requested.
 * Listeners/timer are detached before source reset so reset cannot publish a
 * second result. Abort/timeout requests reset before settling; this is the native
 * element's logical lifecycle, not proof of driver/internal allocation reclaim. */
export const browserMetadataDecoder: MetadataDecoder = (kind, url, signal): NativeMetadataResource => {
  const video = kind === 'video' ? document.createElement('video') : null
  const element = video ?? document.createElement('audio')
  let settled = false, resolve!: (value: MediaInfo) => void, reject!: (error: Error) => void
  let timer: ReturnType<typeof setTimeout> | undefined
  const ready = new Promise<MediaInfo>((yes, no) => { resolve = yes; reject = no })
  const detach = () => {
    clearTimeout(timer); signal.removeEventListener('abort', abort)
    element.onloadedmetadata = null; element.onerror = null
  }
  const reset = () => { element.removeAttribute('src'); element.load() }
  const finish = (error?: Error) => {
    if (settled) return
    settled = true; detach()
    if (error) { try { reset() } catch (failure) { reject(failure instanceof Error ? failure : new Error(String(failure))); return }; reject(error); return }
    try {
      const seconds = element.duration
      resolve({ width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0,
        durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds * 1000)) : 0 })
    } catch (failure) { reject(failure instanceof Error ? failure : new Error(String(failure))) }
  }
  const abort = () => finish(cancelledJobError())
  element.preload = 'metadata'
  if (video) video.muted = true
  element.onloadedmetadata = () => finish()
  element.onerror = () => finish(new MediaMetadataUnavailable('Native media metadata is unavailable.'))
  signal.addEventListener('abort', abort, { once: true })
  timer = setTimeout(() => finish(new MediaMetadataUnavailable('Native media metadata timed out.')), 10000)
  if (signal.aborted) abort()
  else { try { element.src = url; element.load() } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) } }
  return { ready, dispose() { if (!settled) finish(cancelledJobError()); else { detach(); reset() } } }
}
