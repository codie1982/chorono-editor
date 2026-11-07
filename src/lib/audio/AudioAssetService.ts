import type { Asset } from '../types'

interface CacheEntry { buffer: AudioBuffer; bytes: number }
export interface AudioMemorySnapshot { bytes: number; bufferCount: number; pendingCount: number }
export interface AudioAssetServiceOptions {
  createContext?: () => AudioContext
  fetch?: typeof globalThis.fetch
  maxBytes?: number
}

/** One decoder/context for playback, waveform and offline mix. URL identity is
 * deliberate: replacing an asset URL must never reuse its former PCM. */
export class AudioAssetService {
  private context: AudioContext | null = null
  private cache = new Map<string, CacheEntry>()
  private pending = new Map<string, Promise<AudioBuffer>>()
  private generation = 0
  private bytes = 0
  private disposed = false
  constructor(private options: AudioAssetServiceOptions = {}) {}
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
    const entry = this.cache.get(url)
    if (!entry) return undefined
    this.cache.delete(url); this.cache.set(url, entry)
    return entry.buffer
  }
  /**
   * Counts unique decoded PCM buffers, including buffers pinned by a playback
   * engine after LRU eviction. Read-only: never promotes LRU entries or decodes.
   * Float32 channel storage only; context, nodes and compressed source excluded.
   */
  getMemorySnapshot(pinned: readonly AudioBuffer[] = []): AudioMemorySnapshot {
    const unique = new Set(pinned)
    this.cache.forEach(entry => unique.add(entry.buffer))
    let bytes = 0
    unique.forEach(buffer => { bytes += buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT })
    return { bytes, bufferCount: unique.size, pendingCount: this.pending.size }
  }
  load(asset: Asset): Promise<AudioBuffer> { return this.loadUrl(asset.url) }
  async loadUrl(url: string): Promise<AudioBuffer> {
    if (this.disposed) throw new Error('Audio asset service is disposed.')
    const cached = this.peek(url)
    if (cached) return cached
    const pending = this.pending.get(url)
    if (pending) return pending
    const generation = this.generation
    const work = (async () => {
      const response = await (this.options.fetch ?? globalThis.fetch)(url)
      if (!response.ok) throw new Error(`Audio download failed (${response.status}).`)
      const data = await response.arrayBuffer()
      const buffer = await this.getContext().decodeAudioData(data)
      if (this.generation === generation) {
        const bytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT
        this.cache.set(url, { buffer, bytes }); this.bytes += bytes
        this.trim()
      }
      return buffer
    })()
    this.pending.set(url, work)
    try { return await work } finally {
      if (this.pending.get(url) === work) this.pending.delete(url)
    }
  }
  private trim(): void {
    const maxBytes = this.options.maxBytes ?? 256 * 1024 * 1024
    while (this.bytes > maxBytes && this.cache.size) {
      const first = this.cache.entries().next().value as [string, CacheEntry]
      this.cache.delete(first[0]); this.bytes -= first[1].bytes
    }
  }
  clear(): void { this.generation++; this.cache.clear(); this.pending.clear(); this.bytes = 0 }
  async dispose(): Promise<void> {
    this.disposed = true
    this.clear()
    const context = this.context; this.context = null
    if (context && context.state !== 'closed') await context.close()
  }
}

const sharedAudioAssetService = new AudioAssetService()
export const getAudioAssetService = () => sharedAudioAssetService
export const loadAudioBuffer = (asset: Asset) => sharedAudioAssetService.load(asset)
export const peekAudioBuffer = (asset: Asset) => sharedAudioAssetService.peek(asset.url)
export const loadAudioBufferFromUrl = (url: string) => sharedAudioAssetService.loadUrl(url)
