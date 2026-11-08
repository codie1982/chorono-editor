import { assetSourcePool, type AssetSourceLease } from '../../asset/sources'
import type { ImportResult } from '../types'

// Runtime ownership never enters ImportResult JSON or serialized command data.
const owned = new WeakMap<ImportResult, AssetSourceLease[]>()

/** Release a completed/rejected import's creator ownership after commit or
 * discard. Document adoption already transfers the creator lease, so old callers
 * committing through the editor do not keep a hidden second source owner. An
 * independent preview/job must hold its own source lease before this call. */
export function releaseImportSources(result: ImportResult): void {
  const leases = owned.get(result)
  owned.delete(result); leases?.forEach(lease => lease.release())
}

/** Create one owned original URL and attach runtime-only creator ownership to
 * the result. Sync/async construction failures release it. The public result
 * shape and sync GIF builder contract are preserved; no source Blob is copied.
 * Consumers releaseImportSources after committing/discarding the result. */
export function withImportSource(blob: Blob, build: (url: string) => Promise<ImportResult>): Promise<ImportResult>
export function withImportSource(blob: Blob, build: (url: string) => ImportResult): ImportResult
export function withImportSource(blob: Blob,
  build: (url: string) => ImportResult | Promise<ImportResult>): ImportResult | Promise<ImportResult> {
  const lease = assetSourcePool.create(blob)
  const complete = (result: ImportResult) => { const leases = owned.get(result) ?? []; leases.push(lease); owned.set(result, leases); return result }
  const fail = (error: unknown): never => { lease.release(); throw error }
  try {
    const result = build(lease.url)
    if ('then' in result) return result.then(complete, fail)
    return complete(result)
  } catch (error) { return fail(error) }
}
