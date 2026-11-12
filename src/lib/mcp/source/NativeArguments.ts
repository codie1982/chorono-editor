import type { JsonObject } from '../protocol'

/** Convert a validated MCP argument envelope to a native command payload.
 * Authentication/retry/editor-selection fields are transport data, never source
 * properties. Only top-level reserved fields are removed; user-defined nested
 * source metadata is preserved. The result is a new shallow record, borrowing
 * nested JSON values without mutation. Validation must happen before conversion.
 */
export function nativeToolArguments(args: JsonObject): JsonObject {
  const { readToken: _read, expectedRevision: _revision, requestId: _request, sessionId: _session, ...payload } = args
  return payload
}
