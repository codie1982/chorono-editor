import { SourceAccessError } from './SourceAccessError'

export interface SourceScope {
  readonly clientId: string
  readonly sessionId: string
  readonly documentEpoch: string
  readonly revision: number
}
interface ReadGrant extends SourceScope { expiresAtMs: number; used: boolean; planId?: string }
export const READ_ACCESS_TTL_MS = 300_000

/** Bounded, ephemeral, one-use source-read capabilities. Composition injects a
 * cryptographically random token factory and epoch-ms clock. No scene snapshots
 * or serialized history live here. Grants bind the genuine client connection,
 * editor session, runtime document identity and source revision. A script plan
 * gets a separate plan-bound grant; reading again does not invalidate that plan.
 * Expiry/eviction is lazy; no timer survives shutdown. New reads supersede only
 * available ordinary grants for the same client/editor, not reserved plans.
 */
export class ReadAccessRegistry {
  private readonly grants = new Map<string, ReadGrant>()
  constructor(private readonly token: () => string, private readonly clock = Date.now, private readonly maxGrants = 512) {}

  /** Mint after an actual successful get_scene (or a validated dry-run plan).
   * Tokens are returned only to their reading client and expire after five min. */
  issue(scope: SourceScope, planId?: string): { readToken: string; readTokenExpiresAtMs: number } {
    this.prune()
    if (!planId) for (const [token, grant] of Array.from(this.grants)) {
      if (!grant.planId && grant.clientId === scope.clientId && grant.sessionId === scope.sessionId) this.grants.delete(token)
    }
    if (this.grants.size >= this.maxGrants) throw new SourceAccessError('SOURCE_ACCESS_CAPACITY')
    const readToken = this.token(), expiresAtMs = this.clock() + READ_ACCESS_TTL_MS
    this.grants.set(readToken, { ...scope, expiresAtMs, used: false, ...(planId ? { planId } : {}) })
    return { readToken, readTokenExpiresAtMs: expiresAtMs }
  }

  /** Consume before generating/sending a source operation. Failure after
   * admission does not make a token reusable: only exact requestId retry may
   * recover the cached result. Compare current editor scope before consumption. */
  consume(token: string, current: SourceScope, planId?: string): void {
    const grant = this.grants.get(token)
    if (!grant) throw new SourceAccessError('SOURCE_READ_REQUIRED')
    if (grant.expiresAtMs <= this.clock()) { this.grants.delete(token); throw new SourceAccessError('SOURCE_READ_EXPIRED') }
    if (grant.clientId !== current.clientId || grant.sessionId !== current.sessionId || grant.planId !== planId) throw new SourceAccessError('SOURCE_READ_SCOPE')
    if (grant.documentEpoch !== current.documentEpoch) throw new SourceAccessError('SOURCE_DOCUMENT_CHANGED')
    if (grant.revision !== current.revision) throw new SourceAccessError('SOURCE_REVISION_CONFLICT')
    if (grant.used) throw new SourceAccessError('SOURCE_READ_USED')
    grant.used = true
  }

  /** Revoke disconnected client/editor grants and deleted/expired plan grants. */
  revoke(match: { clientId?: string; sessionId?: string; planId?: string }): void {
    for (const [token, grant] of Array.from(this.grants)) if (
      (match.clientId === undefined || match.clientId === grant.clientId) &&
      (match.sessionId === undefined || match.sessionId === grant.sessionId) &&
      (match.planId === undefined || match.planId === grant.planId)) this.grants.delete(token)
  }

  /** Remove expired capabilities before capacity admission; never retain scenes. */
  private prune(): void { for (const [token, grant] of Array.from(this.grants)) if (grant.expiresAtMs <= this.clock()) this.grants.delete(token) }
}
