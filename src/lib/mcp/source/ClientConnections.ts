import { SourceAccessError } from './SourceAccessError'

export interface MCPClientIdentity { readonly id: string; readonly label: string }
interface Connection { identity: MCPClientIdentity; seenAtMs: number }
const CLIENT_TTL_MS = 30 * 60_000

/** Broker-owned connection identities. Display names are labels only; each
 * genuine STDIO connection registers a random private capability via the local
 * authenticated HTTP boundary. Callers cannot select another client's id by
 * supplying clientName. Bounded/lazy expiry; no persistent credentials/timers.
 */
export class ClientConnections {
  private readonly connections = new Map<string, Connection>()
  constructor(private readonly random: () => string, private readonly onClose: (id: string) => void,
    private readonly clock = Date.now, private readonly maximum = 64) {}

  /** Register only at the shared-token authenticated transport boundary. */
  open(label: string): { connectionToken: string; clientId: string } {
    this.prune()
    if (this.connections.size >= this.maximum) throw new SourceAccessError('SOURCE_ACCESS_CAPACITY')
    const connectionToken = this.random(), id = this.random()
    this.connections.set(connectionToken, { identity: Object.freeze({ id, label: label.slice(0, 80) }), seenAtMs: this.clock() })
    return { connectionToken, clientId: id }
  }

  /** Resolve a private connection capability for each request, touching its
   * idle lifetime. Missing/expired credentials never become a shared identity. */
  require(token?: string): MCPClientIdentity {
    this.prune()
    const entry = token ? this.connections.get(token) : undefined
    if (!entry) throw new SourceAccessError('CLIENT_CONNECTION_REQUIRED')
    entry.seenAtMs = this.clock()
    return entry.identity
  }

  /** Internal callers must present the exact broker-owned identity, not a
   * forged record with a matching display name/id. Revalidate queued work too. */
  verify(identity?: MCPClientIdentity): MCPClientIdentity {
    this.prune()
    const entry = Array.from(this.connections.values()).find(value => value.identity === identity)
    if (!entry) throw new SourceAccessError('CLIENT_CONNECTION_REQUIRED')
    entry.seenAtMs = this.clock()
    return entry.identity
  }

  /** Disconnect revokes read/plan authority. Already-admitted native work can
   * have an unknown transport outcome; it is never silently replayed. */
  close(token: string): void {
    const connection = this.connections.get(token)
    if (connection) { this.connections.delete(token); this.onClose(connection.identity.id) }
  }

  private prune(): void {
    for (const [token, entry] of Array.from(this.connections)) if (entry.seenAtMs + CLIENT_TTL_MS <= this.clock()) this.close(token)
  }
}
