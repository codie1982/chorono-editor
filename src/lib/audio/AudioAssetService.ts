import type { Asset } from '../types'
import { SharedPreparationQueue, cancelledJobError, editorMediaPreparation, type JobExecutor, type PreparationQueueSnapshot, type JobQueueSnapshot } from '../resources/jobs'
import { editorResourceBudget, type ResourceAllocator } from '../resources/budget'
import { AudioPcmCache, type AudioPcmLease } from './AudioPcmCache'
import { assetSourcePool } from '../asset/sources'
import { BoundedBinaryReader, type BinaryInputReader, type BinaryInputLease } from '../resources/io'
import {readWavMetadata,wavPcmBytes} from './metadata/readWavMetadata'
export type { AudioPcmLease } from './AudioPcmCache'

interface DecodeResult { buffer: AudioBuffer; lease?: AudioPcmLease; admissionError?: unknown }
export interface AudioMemorySnapshot {
  bytes: number; bufferCount: number; pendingCount: number
  /** Optional for older diagnostic adapters. Active includes cancelled native
   * work that has not settled; pendingCount only counts current URL requests. */
  preparation?: JobQueueSnapshot & Partial<Pick<PreparationQueueSnapshot, 'executing' | 'waitingForExecutor'>>
  residency?: ReturnType<AudioPcmCache['getSnapshot']>
}
export interface AudioAssetServiceOptions {
  createContext?: () => AudioContext
  fetch?: typeof globalThis.fetch
  maxBytes?: number
  maxConcurrent?: number
  maxQueued?: number
  /** Borrow host-wide preparation capacity; local cancellation never closes it. */
  executor?: JobExecutor
  /** Bounded streaming input adapter; default 128 MiB actual response limit,
   * with old+replacement growth charges overlapping the supplied host budget. */
  inputReader?: BinaryInputReader
  budget?: ResourceAllocator
  /** Estimated PCM working set before native decode; actual retained bytes are
   * checked afterwards. Decoder-internal copies/overshoot are not bounded. */
  decodeReserveBytes?: number
  maxIdleMs?: number
}

/** One decoder/context for playback, waveform and offline mix. URL identity is
 * deliberate: replacing an asset URL must never reuse its former PCM. Fetch and
 * native decode share a bounded FIFO (default 2 active / 128 waiting). A URL has
 * one underlying request but independent consumers: one unmount does not cancel
 * another waveform/player. Last consumer cancellation aborts fetch and marks
 * non-abortable decode stale, retaining its queue slot until native settlement.
 *
 * Instances own their queue, context and leased PCM cache, not source URLs.
 * Production consumers use acquire/acquireUrl and release in finally/cleanup.
 * Deprecated load APIs preserve borrowed-buffer compatibility, including uncached
 * opaque-format oversize results; supported WAV PCM exceeding admission is now
 * rejected before native decode for both owned and legacy callers. External raw
 * borrows cannot be protected/accounted after
 * eviction. The editor singleton injects the shared resource budget and two-job
 * aggregate media executor; local active also includes shared-slot wait. */
export class AudioAssetService {
  private context: AudioContext | null = null
  private readonly cache: AudioPcmCache
  private readonly queue: SharedPreparationQueue<DecodeResult>
  private readonly inputReader: BinaryInputReader
  private generation = 0
  private disposed = false
  /** Configure local PCM/admission policy and optionally borrow aggregate job
   * capacity from the host. Construction starts no context/fetch/native work;
   * disposing this service never closes the borrowed executor. */
  constructor(private options: AudioAssetServiceOptions = {}) {
    if (options.decodeReserveBytes !== undefined && (!Number.isSafeInteger(options.decodeReserveBytes) || options.decodeReserveBytes <= 0)) {
      throw new RangeError('Invalid audio decode reservation estimate.')
    }
    this.cache = new AudioPcmCache(options)
    this.inputReader = options.inputReader ?? new BoundedBinaryReader({ budget: options.budget })
    this.queue = new SharedPreparationQueue({ concurrency: options.maxConcurrent ?? 2, maxQueued: options.maxQueued ?? 128,
      executor: options.executor,
      label: 'Audio asset service', release: result => result.lease?.release(),
      discard: (url, result) => { this.cache.invalidate(url, result.buffer); result.lease?.release() } })
  }
  getContext(): AudioContext {
    if (this.disposed) throw new Error('Audio asset service is disposed.')
    if (!this.context || this.context.state === 'closed') {
      const Ctor = typeof window !== 'undefined' && (window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      if (!this.options.createContext && !Ctor) throw new Error('Web Audio is unavailable in this environment.')
      this.context = this.options.createContext ? this.options.createContext() : new (Ctor as typeof AudioContext)()
    }
    return this.context
  }
  peek(url: string): AudioBuffer | undefined {
    const lease = this.cache.acquire(url)
    if (!lease) return undefined
    try { return lease.buffer } finally { lease.release() }
  }
  /**
   * Counts unique decoded PCM buffers, including buffers pinned by a playback
   * engine after LRU eviction. Read-only: never promotes LRU entries or decodes.
   * Float32 channel storage only; context, nodes and compressed source excluded.
   */
  getMemorySnapshot(pinned: readonly AudioBuffer[] = []): AudioMemorySnapshot {
    const unique = new Set(pinned)
    this.cache.buffers().forEach(buffer => unique.add(buffer))
    let bytes = 0
    unique.forEach(buffer => { bytes += buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT })
    return { bytes, bufferCount: unique.size, pendingCount: this.queue.size,
      preparation: this.queue.getSnapshot(), residency: this.cache.getSnapshot() }
  }
  /** Describe current asset identities by URL without retaining source data or
   * promoting cache entries. Retired-but-pinned decodes remain resident here. */
  describeAssets(assets: readonly Asset[]) {
    const resident: Array<{ id: string; bytes: number }> = [], loadingAssetIds: string[] = []
    const sources = this.cache.describeSources()
    assets.forEach(asset => {
      if (asset.type !== 'audio') return
      const bytes = sources.get(asset.url)
      if (bytes !== undefined) resident.push({ id: asset.id, bytes })
      else if (this.queue.has(asset.url)) loadingAssetIds.push(asset.id)
    })
    return { assets: resident, loadingAssetIds }
  }
  /** Acquire one consumer's ownership. Source identity is URL; no source or
   * scene mutation. release is required after last use, even on stale results. */
  acquire(asset: Asset, options: { signal?: AbortSignal } = {}): Promise<AudioPcmLease> { return this.acquireUrl(asset.url, options) }
  /** Deduplicated decode with protected delivery until each caller has its pin.
   * Admission failure is explicit; no untracked fallback for leased consumers. */
  async acquireUrl(url: string, options: { signal?: AbortSignal } = {}): Promise<AudioPcmLease> {
    this.check(options.signal)
    const cached = this.cache.acquire(url)
    if (cached) return cached
    return this.request(url, options.signal, result => {
      if (!result.lease) throw result.admissionError ?? new Error('PCM ownership could not be acquired.')
      return result.lease.retain()
    })
  }
  /** @deprecated Borrowed-buffer compatibility; use acquire and release for
   * retained use. Raw external borrows are outside managed ownership after
   * eviction. Cancellation remains independent for deduplicated consumers. */
  load(asset: Asset, options: { signal?: AbortSignal } = {}): Promise<AudioBuffer> { return this.loadUrl(asset.url, options) }
  /** @deprecated Legacy raw PCM, possibly uncached if opaque decoded size exceeds
   * the retained limit. Known WAV PCM must fit before decoding; no oversize raw
   * fallback bypasses that admission. Use acquireUrl for explicit ownership. */
  async loadUrl(url: string, options: { signal?: AbortSignal } = {}): Promise<AudioBuffer> {
    this.check(options.signal)
    const cached = this.peek(url)
    if (cached) return cached
    return this.request(url, options.signal, result => result.buffer)
  }
  /** Join one decode through the shared bounded/deduplicated delivery owner.
   * The current generation is captured at submission, not at native start.
   * Input URL borrowing lasts until actual settlement, even queued cancellation. */
  private request<T>(url: string, signal: AbortSignal | undefined, project: (result: DecodeResult) => T): Promise<T> {
    const generation = this.generation
    return this.queue.request(url, nativeSignal => this.prepare(url, generation, nativeSignal), project, signal,
      () => { const source = assetSourcePool.retainUrls([url]); return () => source.release() })
  }
  /** No stale decode may create a context or cache entry after cancellation. */
  private check(signal?: AbortSignal): void {
    if (this.disposed) throw new Error('Audio asset service is disposed.')
    if (signal?.aborted) throw cancelledJobError()
  }
  /** Native decoder work only; shared preparation owns request/delivery lifetime.
   * Supported PCM WAV metadata reserves Float32 output at the actual context rate
   * before native decode. Other formats use the existing explicit opaque estimate;
   * actual admission preserves only that legacy uncached-buffer fallback.
   * Encoded input has an independent lease and stays charged through actual
   * non-abortable decode settlement, including native ArrayBuffer detachment. */
  private async prepare(url: string, generation: number, signal: AbortSignal): Promise<DecodeResult> {
    const ticket = this.cache.reserve(Math.min(this.options.decodeReserveBytes ?? 64 * 1024 ** 2, this.cache.maxBytes))
    let admitted = false
    let input: BinaryInputLease | undefined
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(url, { signal })
      input = await this.inputReader.readResponse(response, { signal })
      this.check(signal)
      const wav=readWavMetadata(new Uint8Array(input.buffer))
      const context=this.getContext()
      if(wav&&Number.isSafeInteger(context.sampleRate)&&!ticket.resize(wavPcmBytes(wav,context.sampleRate))) {
        throw new RangeError('WAV PCM output exceeds the managed resource budget before decode.')
      }
      const buffer = await context.decodeAudioData(input.buffer)
      this.check(signal)
      try {
        const lease = this.cache.admit(this.generation === generation ? url : null, buffer, ticket, url)
        admitted = true; return { buffer, lease }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
        return { buffer, admissionError: error }
      }
    } finally { input?.release(); if (!admitted) ticket.release() }
  }
  /** Invalidate cache generation without cancelling existing borrowed callers.
   * Their results remain usable but never repopulate this cleared generation.
   * Use cancelPending for project/service cancellation, not ordinary cache trim. */
  clear(): void { this.generation++; this.cache.clear(); this.queue.forget() }
  /** Release only unused cached PCM, preserving consumers and native work. */
  clearIdle(): void { this.cache.clearIdle() }
  /** Cancel queued/active preparation and clear cache. Already-running native
   * decode cannot be stopped; it stays counted and its result is discarded. Does
   * not revoke source URLs or stop independent playback nodes holding PCM. */
  cancelPending(): void { this.queue.cancelAll(); this.clear() }
  /** Stop admission/cancel preparation and close the owned context. Native work
   * may settle later, but cannot create another context or revive cache data. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.cancelPending(); this.queue.dispose()
    const context = this.context; this.context = null
    if (context && context.state !== 'closed') await context.close()
  }
}

const sharedAudioAssetService = new AudioAssetService({ budget: editorResourceBudget, executor: editorMediaPreparation })
export const getAudioAssetService = () => sharedAudioAssetService
/** One owned consumer of the editor-wide PCM service; caller releases after use. */
export const acquireAudioBuffer = (asset: Asset, options?: { signal?: AbortSignal }) => sharedAudioAssetService.acquire(asset, options)
/** URL-keyed owned PCM; cancellation/stale completion requires caller cleanup. */
export const acquireAudioBufferFromUrl = (url: string, options?: { signal?: AbortSignal }) => sharedAudioAssetService.acquireUrl(url, options)
/** @deprecated Raw borrowed PCM. Use acquireAudioBuffer and release. */
export const loadAudioBuffer = (asset: Asset, options?: { signal?: AbortSignal }) => sharedAudioAssetService.load(asset, options)
/** @deprecated A synchronous raw borrow does not protect retained PCM. */
export const peekAudioBuffer = (asset: Asset) => sharedAudioAssetService.peek(asset.url)
/** @deprecated Raw borrowed PCM. Use acquireAudioBufferFromUrl and release. */
export const loadAudioBufferFromUrl = (url: string, options?: { signal?: AbortSignal }) => sharedAudioAssetService.loadUrl(url, options)
