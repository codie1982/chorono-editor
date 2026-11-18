import type { Asset } from '@/lib/types'
import { MeshDeformationBinaryCodec, type MeshDeformationClip } from '@/lib/mesh2d'
import { editorResourceBudget, type ResourceAllocator } from '@/lib/resources/budget'
import { BoundedBinaryReader, type BinaryInputReader } from '@/lib/resources/io'
import { cancelledJobError, editorMediaPreparation, SharedPreparationQueue, type JobExecutor } from '@/lib/resources/jobs'
import { ResidentResourceCache } from '@/lib/resources/residency'
import { assetSourcePool } from '@/lib/asset/sources'
import type { MeshDeformationLease } from './types'

export interface MeshDeformationAssetOptions {
  readonly budget?: ResourceAllocator
  readonly maxBytes?: number
  readonly maxEntries?: number
  readonly maxIdleMs?: number
  readonly maxConcurrent?: number
  readonly maxQueued?: number
  readonly executor?: JobExecutor
  readonly reader?: BinaryInputReader
  readonly fetcher?: typeof fetch
}

/**
 * Bounded loader/cache for binary `meshDeformation` assets.
 *
 * Fetch input and decoded typed buffers are both admitted during conversion, so
 * peak ownership is explicit. The returned lease owns a cache pin; callers must
 * release it and cannot retain the clip beyond that lifetime. Source URLs are
 * borrowed through the existing asset source pool. Cancellation aborts transport
 * and queued work; decoded results use URL identity and bounded idle residency.
 */
export class MeshDeformationAssetService {
  private readonly cache: ResidentResourceCache<MeshDeformationClip>
  private readonly queue: SharedPreparationQueue<MeshDeformationLease>
  private readonly reader: BinaryInputReader
  private readonly fetcher: typeof fetch
  private readonly codec = new MeshDeformationBinaryCodec()
  private disposed = false

  constructor(options: MeshDeformationAssetOptions = {}) {
    const maxBytes = options.maxBytes ?? 64 * 1024 ** 2
    this.cache = new ResidentResourceCache({
      category: 'derived', label: 'mesh deformation clip', maxBytes,
      maxEntries: options.maxEntries ?? 64, maxIdleMs: options.maxIdleMs,
      budget: options.budget,
      dispose: () => undefined,
    })
    this.reader = options.reader ?? new BoundedBinaryReader({ maxBytes, budget: options.budget })
    this.fetcher = options.fetcher ?? fetch
    this.queue = new SharedPreparationQueue({
      concurrency: options.maxConcurrent ?? 2,
      maxQueued: options.maxQueued ?? 64,
      executor: options.executor,
      label: 'Mesh deformation asset service',
      release: lease => lease.release(),
      discard: (key, lease) => { this.cache.invalidate(key, lease.value); lease.release() },
    })
  }

  /** Acquires one decoded clip using asset URL as immutable source identity. */
  async acquire(asset: Asset, options: { signal?: AbortSignal } = {}): Promise<MeshDeformationLease> {
    this.check(options.signal)
    if (asset.type !== 'meshDeformation') throw new TypeError('Expected a meshDeformation asset')
    if (!asset.url) throw new TypeError('Mesh deformation source URL is empty')
    const key = JSON.stringify(['meshDeformation', asset.url])
    const cached = this.cache.acquire(key)
    if (cached) return cached
    return this.queue.request(
      key,
      signal => this.prepare(asset.url, key, signal),
      lease => lease.retain(),
      options.signal,
      () => { const source = assetSourcePool.retainUrls([asset.url]); return () => source.release() },
    )
  }

  clear(): void { this.queue.forget(); this.cache.clear() }
  clearIdle(): void { this.cache.clearIdle() }
  cancelPending(): void { this.queue.cancelAll(); this.cache.clear() }
  dispose(): void { this.disposed = true; this.queue.dispose(); this.cache.clear() }
  getSnapshot() { return { pendingCount: this.queue.size, preparation: this.queue.getSnapshot(), residency: this.cache.getSnapshot() } }

  private async prepare(url: string, key: string, signal: AbortSignal): Promise<MeshDeformationLease> {
    this.check(signal)
    const response = await this.fetcher(url, { signal })
    const input = await this.reader.readResponse(response, { signal })
    const ticket = this.cache.reserve(Math.max(1, input.byteLength))
    let clip: MeshDeformationClip | undefined, admitted = false
    try {
      this.check(signal)
      clip = this.codec.decode(input.buffer)
      this.check(signal)
      const lease = this.cache.admit(key, clip, Math.max(1, clip.byteLength), ticket, url)
      admitted = true
      return lease
    } finally {
      input.release()
      if (!admitted) {
        if (clip) this.cache.discard(clip, ticket, url)
        else ticket.release()
      }
    }
  }

  private check(signal?: AbortSignal): void {
    if (this.disposed) throw new Error('Mesh deformation asset service is disposed')
    if (signal?.aborted) throw cancelledJobError()
  }
}

/** Composition-root shared service; importing it starts no fetch or decode. */
export const meshDeformationAssetService = new MeshDeformationAssetService({
  budget: editorResourceBudget,
  executor: editorMediaPreparation,
})
