import { ResidentResourceCache } from '../../resources/residency'
import { BoundedJobQueue, cancelledJobError, withPreparationDeadline } from '../../resources/jobs'
import { assetSourcePool } from '../sources'
import { browserVisualDecoder } from '../visual/browserVisualDecoder'
import { ImageMetadataReader } from './ImageMetadataReader'
import { requireFrameBytes } from './frameBytes'
import { browserMetadataDecoder, MediaMetadataUnavailable } from './browserMetadataDecoder'
import type { MediaInfo, MediaProbeOptions, MediaProbeSource, ImagePreviewLease, ProbeExecution } from './types'
import type { VisualResource } from '../visual/types'

/** Owns transient native probes and preview pins, not persistent asset metadata.
 * Header IO/pixel admission precedes image construction; metadata-only audio/video
 * has explicit policy estimates, not measured codec RAM. Reuses the existing job
 * queue and resident owner for actual settlement, pins and failed-cleanup quarantine.
 * No cache lookup/dedupe algorithm is introduced: preview resources are retired
 * entries destroyed at final release. Images/video use one RGBA-frame policy;
 * native internals/animation caches remain opaque. All mutable state is private.
 * Callers borrow returned preview elements only while their pin lives. */
export class MediaProbeService implements MediaProbeSource {
  private readonly queue = new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })
  private readonly owner: ResidentResourceCache<{ dispose(): void }>
  private readonly headers: ImageMetadataReader | NonNullable<MediaProbeOptions['imageMetadata']>
  private readonly imageDecoder: NonNullable<MediaProbeOptions['imageDecoder']>
  private readonly mediaDecoder: NonNullable<MediaProbeOptions['metadataDecoder']>
  private readonly limits: { maxDimension: number; maxFrameBytes: number }
  private readonly timeoutMs: number
  private executing = 0

  /** Host injects the existing aggregate executor/budget; never disposed here.
   * Private hosts default to finite local concurrency/256 MiB/256 records. */
  constructor(private readonly options: MediaProbeOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15000
    this.limits = { maxDimension: options.maxDimension ?? 16384, maxFrameBytes: options.maxFrameBytes ?? 128 * 1024 ** 2 }
    if (![this.timeoutMs, this.limits.maxDimension, this.limits.maxFrameBytes].every(n => Number.isSafeInteger(n) && n > 0)
      || this.timeoutMs > 2147483647) throw new RangeError('Invalid media probe limits.')
    this.owner = new ResidentResourceCache({ category: 'input', label: 'native media probe', maxBytes: 256 * 1024 ** 2,
      maxEntries: 256, maxIdleMs: 0, budget: options.budget, dispose: value => value.dispose() })
    this.headers = options.imageMetadata ?? new ImageMetadataReader({ budget: options.budget })
    this.imageDecoder = options.imageDecoder ?? browserVisualDecoder
    this.mediaDecoder = options.metadataDecoder ?? browserMetadataDecoder
  }

  /** Validate decode and return native display dimensions (EXIF/density included),
   * dropping transient native/source ownership before the scalar result escapes. */
  image(file: File, execution?: ProbeExecution): Promise<MediaInfo> {
    return this.run(async signal => {
      const preview = await this.acquireImage(file, signal)
      try { return { width: preview.width, height: preview.height, durationMs: 0 } }
      finally { preview.release() }
    }, execution)
  }

  /** One ready native image pin for sprite UI; no second unmanaged <img> load.
   * A cancelled handoff releases the late pin before either queue slot is freed. */
  preview(file: File, execution?: ProbeExecution): Promise<ImagePreviewLease> {
    return this.run(signal => this.acquireImage(file, signal), execution, lease => lease.release())
  }

  /** Metadata-only video keeps the historical <100ms unknown-duration policy.
   * Pixel bounds are validated before its scalar result/source can be adopted. */
  video(file: File, execution?: ProbeExecution): Promise<MediaInfo> {
    return this.run(async signal => {
      const info = await this.media(file, 'video', signal)
      return { ...info, durationMs: info.durationMs >= 100 ? info.durationMs : 0 }
    }, execution)
  }

  /** Preserve unknown-duration audio only for expected native-unavailable cases.
   * Queue, budget, abort and deadline errors remain fatal and never fall back. */
  audio(file: File, execution?: ProbeExecution): Promise<MediaInfo> {
    return this.run(async signal => {
      try { return await this.media(file, 'audio', signal) }
      catch (error) { if (error instanceof MediaMetadataUnavailable) return { width: 0, height: 0, durationMs: 0 }; throw error }
    }, execution)
  }

  /** Explicitly retry quarantined cleanup, preserving live preview pins. */
  clearIdle(): void { this.owner.clearIdle() }
  /** Numeric local ownership only; local and shared job counts overlap. */
  getSnapshot() { return { preparation: { ...this.queue.getSnapshot(), executing: this.executing,
    waitingForExecutor: Math.max(0, this.queue.getSnapshot().active - this.executing) }, residency: this.owner.getSnapshot() } }

  /** Outer local admission → borrowed shared executor. Shared work never waits
   * on this owner. Cancellation at each handoff has exactly one discard owner. */
  private run<T>(work: (signal: AbortSignal) => Promise<T>, execution?: ProbeExecution, discard?: (value: T) => void): Promise<T> {
    const execute = async (signal: AbortSignal) => { this.executing++; try { this.check(signal); return await work(signal) } finally { this.executing-- } }
    return withPreparationDeadline('Media probe', this.timeoutMs, execution?.signal, signal =>
      this.queue.submit(local => this.options.executor ? this.options.executor.submit(execute, { signal: local, discard }) : execute(local), { signal, discard }))
  }

  /** Read header before native creation; reserve known coded/canvas RGBA or an
   * explicit 64 MiB opaque estimate. Native geometry above a supported header
   * rejects; orientation swaps/density reductions preserve the admitted product. */
  private async acquireImage(file: File, signal: AbortSignal): Promise<ImagePreviewLease> {
    this.check(signal)
    if (file.size > 128 * 1024 ** 2) throw new RangeError('Image source exceeds the 128 MiB file policy.')
    const header = await this.headers.readBlob(file, signal)
    this.check(signal)
    const known = header.width !== null && header.height !== null ? requireFrameBytes(header.width, header.height, this.limits) : null
    const ticket = this.owner.reserve(known ?? Math.min(64 * 1024 ** 2, this.limits.maxFrameBytes))
    let resource: VisualResource | undefined, transferred = false
    let source: ReturnType<typeof assetSourcePool.create> | undefined
    const owned = { dispose() { resource?.dispose(); source?.release() } }
    try {
      this.check(signal); source = assetSourcePool.create(file)
      resource = this.imageDecoder({ kind: 'image', url: source.url, admitFrame: (width, height) => {
        const bytes = requireFrameBytes(width, height, this.limits)
        if (known !== null && bytes > known) throw new Error('Native image dimensions exceed its supported header.')
        if (!ticket.resize(Math.max(known ?? 0, bytes))) throw new RangeError('Image probe exceeds the managed resource budget.')
      } }, signal)
      await resource.ready; this.check(signal)
      const actual = requireFrameBytes(resource.width, resource.height, this.limits)
      if (known !== null && actual > known) throw new Error('Native image dimensions exceed its supported header.')
      const pin = this.owner.admit(null, owned, Math.max(known ?? 0, actual), ticket)
      transferred = true
      const image = resource
      return {
        get element() { pin.value; if (!(image.element instanceof HTMLImageElement)) throw new TypeError('Image preview backend did not provide an image element.'); return image.element },
        get width() { pin.value; return image.width }, get height() { pin.value; return image.height }, release: () => pin.release(),
      }
    } finally { if (!transferred) this.owner.discard(owned, ticket) }
  }

  /** Reserve before source/element construction; native reset failures keep
   * handle, source lease and charge quarantined for explicit cleanup retry. */
  private async media(file: File, kind: 'video' | 'audio', signal: AbortSignal): Promise<MediaInfo> {
    this.check(signal)
    const ticket = this.owner.reserve(kind === 'audio' ? 1024 ** 2 : Math.min(64 * 1024 ** 2, this.limits.maxFrameBytes))
    let resource: ReturnType<typeof this.mediaDecoder> | undefined, source: ReturnType<typeof assetSourcePool.create> | undefined
    const owned = { dispose() { resource?.dispose(); source?.release() } }
    try {
      source = assetSourcePool.create(file); resource = this.mediaDecoder(kind, source.url, signal)
      const info = await resource.ready; this.check(signal)
      if (kind === 'video' && !ticket.resize(requireFrameBytes(info.width, info.height, this.limits))) throw new RangeError('Video metadata exceeds the managed resource budget.')
      return info
    } finally { this.owner.discard(owned, ticket) }
  }

  /** Shared cancellation error; does not free non-settled native work. */
  private check(signal?: AbortSignal): void { if (signal?.aborted) throw cancelledJobError() }
}
