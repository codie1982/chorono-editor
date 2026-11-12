import { getLocalToken } from '../lib/mcp/storage'
import { MCP_VERSION } from '../lib/mcp/protocol'
import { SourceAccessError, sourceFailure } from '../lib/mcp/source/SourceAccessError'

/** One private broker connection per STDIO transport lifetime. Registration is
 * coalesced across concurrent first calls; display names never select identity.
 * Credentials stay in memory/headers, outside tool arguments, scene JSON and
 * output logs. No mutation is retried automatically on any transport failure.
 * Expired connections reconnect only for the next deliberate tool call, which
 * must read get_scene to obtain new write authority. close is best-effort;
 * broker idle expiry bounds abandoned connections if the process is killed.
 */
export class EditorConnection {
  private token?: string
  private opening?: Promise<string>
  private closed = false
  constructor(private readonly endpoint: URL, private readonly label: () => string,
    private readonly fetcher: typeof fetch = fetch) {}

  /** Forward one exact operation. Unknown outcomes are returned as failures,
   * never replayed with a newly issued client identity. */
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    const token = await this.ensureConnection()
    try { return (await this.post({ op: 'call', name, arguments: args }, token)).result }
    catch (failure) {
      if (failure instanceof SourceAccessError && failure.code === 'CLIENT_CONNECTION_REQUIRED') this.token = undefined
      throw failure
    }
  }

  /** Forget local credentials synchronously; closing a remote connection cannot
   * turn shutdown into a retry or reveal its private credential in an error. */
  async close(): Promise<void> {
    this.closed = true
    const token = this.token; this.token = undefined
    if (token) await this.post({ op: 'close_client' }, token, 2000).catch(() => {})
  }

  private async ensureConnection(): Promise<string> {
    if (this.closed) throw new SourceAccessError('CLIENT_CONNECTION_REQUIRED')
    if (this.token) return this.token
    if (!this.opening) this.opening = this.post({ op: 'connect_client', protocolVersion: MCP_VERSION, clientName: this.label() }).then(async body => {
      if (body.protocolVersion !== MCP_VERSION || !/^[a-f0-9]{64}$/.test(body.connectionToken ?? '')) throw new SourceAccessError('SOURCE_PROTOCOL_REQUIRED')
      if (this.closed) { await this.post({ op: 'close_client' }, body.connectionToken, 2000).catch(() => {}); throw new SourceAccessError('CLIENT_CONNECTION_REQUIRED') }
      this.token = body.connectionToken
      return body.connectionToken as string
    }).finally(() => { this.opening = undefined })
    return this.opening
  }

  /** Authenticated loopback transport only. Headers never enter the JSON body
   * or tool replies. The server composition validates the endpoint's origin. */
  private async post(body: Record<string, unknown>, connectionToken?: string, timeoutMs = 130000): Promise<any> {
    const response = await this.fetcher(this.endpoint, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${await getLocalToken()}`,
      ...(connectionToken ? { 'X-Chorono-MCP-Connection': connectionToken } : {}),
    }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
    const value = await response.json()
    if (!response.ok || value.error) throw sourceFailure(value.error) ?? new Error(typeof value.error === 'string' ? value.error : `Editor HTTP ${response.status}`)
    return value
  }
}
