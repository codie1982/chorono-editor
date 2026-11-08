import type { Asset } from '../../types'
import { editorResourceBudget, type ResourceAllocator } from '../../resources/budget'
import { ResidentResourceCache } from '../../resources/residency'
import { SharedPreparationQueue, cancelledJobError, editorMediaPreparation, type JobExecutor } from '../../resources/jobs'
import { assetSourcePool } from '../sources'
import { browserVisualDecoder } from './browserVisualDecoder'
import { ImageMetadataReader, rgbaFrameBytes, requireFrameBytes, type ImageMetadataSource } from '../metadata'
import type { VisualDecoder, VisualInput, VisualLease, VisualResource } from './types'

export interface VisualAssetOptions {
  budget?: ResourceAllocator; maxBytes?: number; maxEntries?: number; maxIdleMs?: number
  maxConcurrent?: number; maxQueued?: number; unknownSizeEstimate?: number; decoder?: VisualDecoder
  /** Borrow host-wide preparation capacity, retaining local request ownership. */
  executor?: JobExecutor
  /** Custom native backends may provide their own header capability. Default
   * browser decoding uses bounded header IO; injected decoder-only test/platform
   * adapters remain responsible for their own preallocation guarantees. */
  imageMetadata?: ImageMetadataSource
}
/**
 * Owned image/video preparation and residency, independent of React and frame
 * demand policy. Images/sheets share by URL. Videos REQUIRE caller-scoped clip
 * identity, sharing only when callers deliberately use the same clock owner.
 * Source identity is URL, not asset id, so replacing a source cannot hit old data.
 *
 * Reuses SharedPreparationQueue (2 active/128 waiting) and ResidentResourceCache
 * (192 MiB/256 local records plus optional global budget), including delivery
 * pins, native cancellation settlement, retirement and at most 2s warm grace.
 * No media starts until explicitly acquired. Original URLs are borrowed through
 * queue settlement, not revoked on decode eviction. Instances own decoded native
 * handles, not source files or transport clocks. The application composition
 * root injects the existing 512 MiB budget and aggregate two-job media executor;
 * no second global budget is created. Local active includes shared-slot wait.
 */
export class VisualAssetService {
  private readonly cache: ResidentResourceCache<VisualResource>
  private readonly queue: SharedPreparationQueue<VisualLease>
  private readonly decode: VisualDecoder
  private readonly unknownEstimate: number
  private readonly headers: ImageMetadataSource | null
  private generation = 0
  private disposed = false

  /** Construction does not create DOM elements or start preparation. Missing
   * dimensions reserve 64 MiB (capped to the local limit); actual frame bytes are
   * reconciled afterwards. Optional executor is borrowed host-wide capacity;
   * disposal cancels only this owner's jobs. This cannot bound native internal overshoot. */
  constructor(options: VisualAssetOptions = {}) {
    this.unknownEstimate = options.unknownSizeEstimate ?? 64 * 1024 ** 2
    if (!Number.isSafeInteger(this.unknownEstimate) || this.unknownEstimate <= 0) throw new RangeError('Invalid visual decode estimate.')
    this.cache = new ResidentResourceCache({ ...options, category: 'image', label: 'visual media',
      maxBytes: options.maxBytes ?? 192 * 1024 ** 2, maxEntries: options.maxEntries ?? 256, dispose: value => value.dispose() })
    this.queue = new SharedPreparationQueue({ concurrency: options.maxConcurrent ?? 2, maxQueued: options.maxQueued ?? 128,
      executor: options.executor,
      label: 'Visual asset service', release: lease => lease.release(),
      discard: (key, lease) => { this.cache.invalidate(key, lease.value); lease.release() } })
    this.decode = options.decoder ?? browserVisualDecoder
    this.headers = options.imageMetadata ?? (options.decoder ? null : new ImageMetadataReader({ budget: options.budget }))
  }
  /** Acquire a drawable image/sprite-sheet or a clip-specific video. consumerId
   * is mandatory for video and must include the host/document scope plus clip
   * identity. Distinct clip clocks use distinct IDs, even for the same source.
   * Consumer cancellation is independent of another caller's shared request.
   * Caller releases the returned pin and must ignore/release a late stale result. */
  async acquire(asset: Asset, options: { consumerId?: string; signal?: AbortSignal } = {}): Promise<VisualLease> {
    this.check(options.signal)
    const input = this.input(asset), key = this.key(input, options.consumerId)
    const cached = this.cache.acquire(key)
    if (cached) return cached
    const generation = this.generation
    const estimate = rgbaFrameBytes(asset.width, asset.height) ?? Math.min(this.unknownEstimate, this.cache.maxBytes)
    return this.queue.request(key, signal => this.prepare(input, key, estimate, generation, signal), delivery => delivery.retain(), options.signal,
      () => { const source = assetSourcePool.retainUrls([input.url]); return () => source.release() })
  }
  /** Explicit invalidation keeps active DOM pins valid until their final release;
   * old promised callers finish with retired data, never repopulating this cache. */
  clear(): void { this.generation++; this.queue.forget(); this.cache.clear() }
  /** Release unused decoded handles without affecting playing/pinned consumers. */
  clearIdle(): void { this.cache.clearIdle() }
  /** Request cancellation, preserving native slots/reservations until settlement. */
  cancelPending(): void { this.queue.cancelAll(); this.clear() }
  /** Stop admission and cancel pending work; existing pins remain valid. */
  dispose(): void { this.disposed = true; this.cancelPending(); this.queue.dispose() }
  /** Numeric accounting only; source inventory is internal join data, not URLs
   * exposed in the UI. Local/managed counts overlap and must not be summed. */
  getSnapshot() { return { pendingCount: this.queue.size, preparation: this.queue.getSnapshot(), residency: this.cache.getSnapshot() } }
  /** Read-only retained source-byte inventory, including retired consumer pins.
   * A video row can include several clip frames; no load/pin/LRU refresh occurs. */
  describeSources(): ReadonlyMap<string, number> { return this.cache.describeSources() }
  /** Type validation is explicit instead of silently treating unsupported media
   * as an image. Font lifetime/measurement uses its own adapter. */
  private input(asset: Asset): VisualInput {
    if (asset.type !== 'image' && asset.type !== 'spriteSheet' && asset.type !== 'video') throw new TypeError('Unsupported visual asset type.')
    if (!asset.url) throw new TypeError('Visual media source URL is empty.')
    return { kind: asset.type === 'video' ? 'video' : 'image', url: asset.url }
  }
  /** Structured tuple identity avoids delimiter collisions without retaining a
   * scene or aliasing a video's mutable clock with another consumer. */
  private key(input: VisualInput, consumerId?: string): string {
    if (input.kind === 'video' && !consumerId) throw new TypeError('Video preparation requires a scoped clip consumerId.')
    return JSON.stringify([input.kind, input.url, input.kind === 'video' ? consumerId : null])
  }
  /** Native preparation owns one reservation from BEFORE DOM/source creation.
   * Any failed/stale resource is destroyed (or quarantined) before uncharging. */
  private async prepare(input: VisualInput, key: string, estimate: number, generation: number, signal: AbortSignal): Promise<VisualLease> {
    if (estimate <= 0) throw new RangeError('Visual preparation exceeds the managed resource budget.')
    const ticket = this.cache.reserve(estimate, input.kind)
    let resource: VisualResource | undefined, admitted = false
    try {
      this.check(signal)
      let codedBytes: number | null = null
      if (input.kind === 'image' && this.headers) {
        const header = await this.headers.readUrl(input.url, signal)
        this.check(signal)
        if (header.width !== null && header.height !== null) codedBytes = requireFrameBytes(header.width, header.height)
        if (!ticket.resize(codedBytes ?? Math.min(this.unknownEstimate, this.cache.maxBytes))) throw new RangeError('Visual header exceeds the managed resource budget.')
      }
      const admitFrame = (width: number, height: number) => {
        const bytes = requireFrameBytes(width, height)
        if (codedBytes !== null && bytes > codedBytes) throw new Error('Native image dimensions exceed its supported header.')
        if (!ticket.resize(Math.max(codedBytes ?? 0, bytes))) throw new RangeError('Visual frame exceeds the managed resource budget.')
      }
      resource = this.decode({ ...input, admitFrame }, signal)
      await resource.ready; this.check(signal)
      const actual = rgbaFrameBytes(resource.width, resource.height)
      if (actual === null) throw new Error('Decoded visual media has invalid dimensions.')
      if (codedBytes !== null && actual > codedBytes) throw new Error('Native image dimensions exceed its supported header.')
      const bytes = Math.max(codedBytes ?? 0, actual)
      const delivery = this.cache.admit(this.generation === generation ? key : null, resource, bytes, ticket, input.url)
      admitted = true; return delivery
    } finally {
      if (!admitted) { if (resource) this.cache.discard(resource, ticket, input.url); else ticket.release() }
    }
  }
  /** A disposed/stale producer cannot recreate DOM work or cache data. */
  private check(signal?: AbortSignal): void {
    if (this.disposed) throw new Error('Visual asset service is disposed.')
    if (signal?.aborted) throw cancelledJobError()
  }
}

/** Composition root only. Viewport/export demand integration follows separately;
 * merely importing this service starts no decode and pins no media. */
export const visualAssetService = new VisualAssetService({ budget: editorResourceBudget, executor: editorMediaPreparation })
