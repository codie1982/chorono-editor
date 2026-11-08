import type { Asset } from '../../types'

/** Source leases protect original URL lifetime, not decoded pixel/PCM residency.
 * Release is idempotent. No DOM, source data or URL list is exposed by a lease. */
export interface AssetSourceLease { release(): void }
interface Source { url: string; refs: number; owned: boolean; pending: boolean; failed: boolean; creatorRelease?: () => void }
interface AssetSet { wanted: ReadonlyMap<string, boolean>; consumers: number; lease?: AssetSourceLease }
/** Platform operations must match native Blob URL identity/lifetime. defer must
 * enqueue a microtask-equivalent callback, never call it inline. */
export interface SourcePlatform { create(blob: Blob): string; revoke(url: string): void; defer(callback: () => void): void }
const platform: SourcePlatform = { create: blob => URL.createObjectURL(blob), revoke: url => URL.revokeObjectURL(url), defer: fn => queueMicrotask(fn) }

/**
 * Original Blob URL lifetime owner shared by import, history and async jobs.
 * Explicit create/runtime.objectUrl ownership may revoke on final release;
 * borrowed legacy blob URLs are protected but never adopted merely by reading.
 * Remote/data URLs need no object-URL lease. Decoded media stays in other owners.
 *
 * Zero-ref release is deferred by one microtask so StrictMode cleanup/setup and
 * synchronous owner transfers can reacquire without revoking a live source.
 * Failed revocation stays registered/quarantined instead of being reported freed.
 * Instances own only URL strings/counters, no Blob copies, DOM or scene/history.
 * Callers must release leases; snapshot is numeric and never exposes URLs.
 */
export class AssetSourcePool {
  private readonly sources = new Map<string, Source>()
  private readonly assetSets = new WeakMap<readonly Asset[], AssetSet>()
  private scheduled = false
  private revoked = 0
  private failures = 0
  /** Copy no source data; platform operations run only on acquire/release. */
  constructor(private readonly api: SourcePlatform = platform) {}

  /** Create exactly one owned source URL. The creator releases after a result,
   * document or job has acquired its own lease, including failure/cancellation.
   * Document adoption consumes creator ownership automatically; release remains
   * idempotent afterwards, preserving old import callers that commit directly. */
  create(blob: Blob): AssetSourceLease & { readonly url: string } {
    const url = this.api.create(blob)
    const lease = this.retain(new Map([[url, true]]))
    const source = this.sources.get(url)!
    const release = () => { if (source.creatorRelease === release) source.creatorRelease = undefined; lease.release() }
    source.creatorRelease = release
    return { url, release }
  }

  /** Retain unique blob URLs in asset.url and runtime.objectUrl. The runtime
   * field explicitly denotes application-owned ephemeral storage; ordinary
   * blob URLs without that field remain borrowed unless explicitly disposed.
   * Asset arrays must be immutable: descriptors are cached weakly by identity.
   * Stable sets coalesce nested jobs but release only after the last consumer.
   * transferCreators is reserved for document adoption, after acquiring the set.
   * Does not mutate metadata or retain Asset/runtime.decoded objects. */
  retainAssets(assets: readonly Asset[], options: { transferCreators?: boolean } = {}): AssetSourceLease {
    let set = this.assetSets.get(assets)
    if (!set) {
      const wanted = new Map<string, boolean>()
      assets.forEach(asset => {
        if (typeof asset.url === 'string' && asset.url.startsWith('blob:')) wanted.set(asset.url, wanted.get(asset.url) ?? false)
        const runtime = asset.runtime?.objectUrl
        if (typeof runtime === 'string' && runtime.startsWith('blob:')) wanted.set(runtime, true)
      })
      set = { wanted, consumers: 0 }; this.assetSets.set(assets, set)
    }
    if (set.consumers++ === 0) set.lease = this.retain(set.wanted)
    if (options.transferCreators) set.wanted.forEach((_owned, url) => this.sources.get(url)?.creatorRelease?.())
    let released = false
    return { release: () => {
      if (released) return
      released = true
      if (--set!.consumers === 0) { set!.lease!.release(); set!.lease = undefined }
    } }
  }
  /** Hold a stable immutable source set throughout async job completion/failure.
   * Nested frame operations share array-level ownership, avoiding a full source
   * scan/refcount pass per sequence frame. No async context/global "current job"
   * is used, so concurrent jobs retain independent lifetimes. */
  async withAssets<T>(assets: readonly Asset[], work: () => T | Promise<T>): Promise<T> {
    const lease = this.retainAssets(assets)
    try { return await work() } finally { lease.release() }
  }
  /** Borrow pending-load source identities without claiming their ownership or
   * consuming a creator's import-result lease. */
  retainUrls(urls: Iterable<string>): AssetSourceLease {
    const wanted = new Map<string, boolean>()
    for (const url of Array.from(urls)) if (url.startsWith('blob:')) wanted.set(url, false)
    return this.retain(wanted)
  }

  /** Legacy explicit source disposal, now protected by outstanding document/job
   * leases. Unheld URLs are revoked synchronously for existing registry callers.
   * Held borrowed URLs become owned by this explicit disposal request. */
  requestRevoke(url: string): void {
    if (!url.startsWith('blob:')) return
    const source = this.sources.get(url) ?? { url, refs: 0, owned: true, pending: false, failed: false }
    source.owned = true; this.sources.set(url, source)
    source.creatorRelease?.()
    if (!source.refs) this.revoke(source)
  }

  /** Numeric inventory of source handles, NOT decoded bytes or process RAM. */
  getSnapshot() {
    let references = 0, ownedUrls = 0, borrowedUrls = 0, pendingUrls = 0, failedUrls = 0
    this.sources.forEach(source => { references += source.refs; source.owned ? ownedUrls++ : borrowedUrls++
      pendingUrls += Number(source.pending); failedUrls += Number(source.failed) })
    return { ownedUrls, borrowedUrls, references, pendingUrls, failedUrls, revoked: this.revoked, failures: this.failures }
  }

  /** Acquire before another owner releases. A zero-ref pending record can be
   * revived in the same task; no new source URL or source copy is created. */
  private retain(wanted: ReadonlyMap<string, boolean>): AssetSourceLease {
    const held: Source[] = []
    wanted.forEach((owned, url) => {
      const source = this.sources.get(url) ?? { url, refs: 0, owned: false, pending: false, failed: false }
      source.owned ||= owned; source.refs++; source.pending = false
      this.sources.set(url, source); held.push(source)
    })
    let released = false
    return { release: () => {
      if (released) return
      released = true
      let pending = false
      held.forEach(source => { source.refs--; if (!source.refs) { source.pending = true; pending = true } })
      if (pending) this.schedule()
    } }
  }
  /** One deferred collector per task; no timer/polling or unbounded trace. */
  private schedule(): void {
    if (this.scheduled) return
    this.scheduled = true
    this.api.defer(() => {
      this.scheduled = false
      Array.from(this.sources.values()).forEach(source => {
        if (source.refs || !source.pending) return
        if (source.owned) this.revoke(source)
        else this.sources.delete(source.url)
      })
    })
  }
  /** Only actual successful revocation removes owned tracking. Failed cleanup
   * is not repeatedly retried in a microtask loop; a later explicit request or
   * retain/release may retry it. */
  private revoke(source: Source): void {
    source.pending = false
    try { this.api.revoke(source.url); this.sources.delete(source.url); this.revoked++ }
    catch { source.failed = true; this.failures++ }
  }
}

/** Composition root. No browser operation occurs before actual acquire/create. */
export const assetSourcePool = new AssetSourcePool()
