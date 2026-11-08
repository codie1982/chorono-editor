import type { Asset } from '../../types'
import { assetSourcePool, type AssetSourceLease, type AssetSourcePool } from './AssetSourcePool'

/**
 * Holds source leases for a set of current immutable asset arrays. History
 * adapters supply present/past/future/transaction arrays; async consumers can
 * use the same operation without importing editor types into the asset domain.
 * Identical array identities are scanned/acquired once, not once per frame or
 * repeated history state. New arrays are acquired before old arrays release.
 *
 * Construction/update while inactive are side-effect free. start/stop support
 * StrictMode lifecycle replay; stop releases all leases but preserves only the
 * current input metadata for restart. No scene or decoded handle is written.
 */
export class AssetSourceOwner {
  private current = new Set<readonly Asset[]>()
  private readonly leases = new Map<readonly Asset[], AssetSourceLease>()
  private active = false
  /** Injects source-lifetime ownership only; no decoder/renderer is required. */
  constructor(private readonly pool: Pick<AssetSourcePool, 'retainAssets'> = assetSourcePool) {}

  /** Replace the complete source set. Dropped history/redo/preview arrays cease
   * retaining URLs immediately; actual final revocation follows pool policy. */
  update(arrays: Iterable<readonly Asset[]>): void {
    this.current = new Set(arrays)
    if (!this.active) return
    this.current.forEach(assets => { if (!this.leases.has(assets)) this.leases.set(assets, this.pool.retainAssets(assets, { transferCreators: true })) })
    this.leases.forEach((lease, assets) => { if (!this.current.has(assets)) { this.leases.delete(assets); lease.release() } })
  }
  /** Activate once; repeated setup never duplicates leases. */
  start(): void { if (!this.active) { this.active = true; this.update(this.current) } }
  /** Release runtime ownership, preserving input metadata only for replay. */
  stop(): void { this.active = false; this.leases.forEach(lease => lease.release()); this.leases.clear() }
}
