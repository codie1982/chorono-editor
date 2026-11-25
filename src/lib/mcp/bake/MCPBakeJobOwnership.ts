const OWNERSHIP_TTL_MS = 30 * 60 * 1000

export interface MCPBakeJobOwner {
  readonly jobId: string
  readonly clientId: string
  readonly sessionId: string
  readonly createdAtMs: number
  readonly seenAtMs: number
}

/**
 * Broker-side ownership for opaque browser bake jobs.
 *
 * Runtime previews live in the paired editor tab; this registry only prevents
 * another MCP connection or editor session from guessing/reusing a job id. It
 * is bounded by time and explicitly released on client/session teardown.
 * Instances contain mutable transport state and never enter project JSON.
 */
export class MCPBakeJobOwnership {
  private readonly jobs = new Map<string, MCPBakeJobOwner>()

  constructor(private readonly clock: () => number = Date.now) {}

  /** Register one unique job after the paired editor confirms creation. */
  register(jobId: string, clientId: string, sessionId: string): MCPBakeJobOwner {
    if (!/^bake-[A-Za-z0-9_-]{8,120}$/.test(jobId)) throw new Error('Editor returned an invalid bake job id')
    if (this.jobs.has(jobId)) throw new Error('Bake job id already exists')
    const now = this.clock()
    const owner = Object.freeze({ jobId, clientId, sessionId, createdAtMs: now, seenAtMs: now })
    this.jobs.set(jobId, owner)
    return owner
  }

  /** Require the same genuine client connection and paired editor session. */
  require(jobId: string, clientId: string, sessionId: string): MCPBakeJobOwner {
    const owner = this.jobs.get(jobId)
    if (!owner || owner.clientId !== clientId || owner.sessionId !== sessionId) {
      throw new Error('Bake job not found for this MCP client/editor session')
    }
    const touched = Object.freeze({ ...owner, seenAtMs: this.clock() })
    this.jobs.set(jobId, touched)
    return touched
  }

  /** Forget one owned job after explicit discard. */
  remove(jobId: string): MCPBakeJobOwner | undefined {
    const owner = this.jobs.get(jobId)
    this.jobs.delete(jobId)
    return owner
  }

  /** Release every job belonging to a closing MCP client connection. */
  releaseClient(clientId: string): MCPBakeJobOwner[] {
    return this.release(owner => owner.clientId === clientId)
  }

  /** Release every job belonging to a disconnected browser editor session. */
  releaseSession(sessionId: string): MCPBakeJobOwner[] {
    return this.release(owner => owner.sessionId === sessionId)
  }

  /** Evict abandoned ownership records; callers cancel the matching browser jobs. */
  prune(): MCPBakeJobOwner[] {
    const threshold = this.clock() - OWNERSHIP_TTL_MS
    return this.release(owner => owner.seenAtMs < threshold)
  }

  private release(predicate: (owner: MCPBakeJobOwner) => boolean): MCPBakeJobOwner[] {
    const released: MCPBakeJobOwner[] = []
    for (const [jobId, owner] of Array.from(this.jobs)) {
      if (!predicate(owner)) continue
      this.jobs.delete(jobId)
      released.push(owner)
    }
    return released
  }
}
