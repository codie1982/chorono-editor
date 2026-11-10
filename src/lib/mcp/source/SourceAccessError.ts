export const SOURCE_FAILURES = {
  CLIENT_CONNECTION_REQUIRED: 'Reconnect the MCP client to this protocol version, then read get_scene before editing.',
  SOURCE_READ_REQUIRED: 'Read get_scene in this client connection and pass its readToken before editing.',
  EXPECTED_REVISION_REQUIRED: 'Pass the integer revision from get_scene as expectedRevision.',
  SOURCE_READ_EXPIRED: 'The scene read expired. Read get_scene again and adapt the intended edit.',
  SOURCE_READ_USED: 'This read token was already used. Retry only the exact requestId and payload, or read get_scene again.',
  SOURCE_READ_SCOPE: 'The scene read belongs to another client, editor, document or script plan. Read get_scene again.',
  SOURCE_REVISION_CONFLICT: 'Scene revision conflict: source changed after reading. Read get_scene again and adapt the edit.',
  SOURCE_DOCUMENT_CHANGED: 'The editor document was replaced. Read get_scene again before editing.',
  SOURCE_EDITOR_BUSY: 'Editor drag transaction is active; read get_scene after it finishes.',
  SOURCE_ACCESS_CAPACITY: 'Too many active client reads or plans. Close idle connections or wait for expiry.',
  SOURCE_PROTOCOL_REQUIRED: 'This bridge requires MCP protocol 2.0.0. Rebuild/restart the editor and reconnect the MCP client.',
} as const

export type SourceFailureCode = keyof typeof SOURCE_FAILURES
export interface SourceFailure {
  readonly code: SourceFailureCode
  readonly message: string
  readonly recovery: 'get_scene' | 'reconnect' | 'wait'
}

/** Fixed, credential-free error contract shared by browser, broker and STDIO.
 * No token, scene, caller argument or stack is included in its public payload. */
export class SourceAccessError extends Error {
  constructor(readonly code: SourceFailureCode) { super(SOURCE_FAILURES[code]); this.name = 'SourceAccessError' }
  toJSON(): SourceFailure {
    return { code: this.code, message: this.message, recovery: this.code === 'SOURCE_ACCESS_CAPACITY' ? 'wait'
      : this.code === 'CLIENT_CONNECTION_REQUIRED' || this.code === 'SOURCE_PROTOCOL_REQUIRED' ? 'reconnect' : 'get_scene' }
  }
}

/** Reconstruct only allowlisted failure categories from the authenticated local
 * bridge. Arbitrary transport strings retain their existing generic handling. */
export function sourceFailure(value: unknown): SourceAccessError | undefined {
  const code = value && typeof value === 'object' ? (value as { code?: unknown }).code : undefined
  return typeof code === 'string' && Object.hasOwn(SOURCE_FAILURES, code) ? new SourceAccessError(code as SourceFailureCode) : undefined
}
