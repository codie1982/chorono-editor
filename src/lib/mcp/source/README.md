# Source editing authorization (MCP 2.1.0)

This module owns ephemeral authority to edit authored source. It reuses the
existing ActionRegistry, editor document lifetime, transaction/undo engine and
QuickJS authoring sandbox. It does not maintain another scene or history.

## Data flow and public boundaries

1. `src/mcp/EditorConnection.ts` registers one genuine STDIO connection via the
   authenticated loopback API. Its private credential lives only in memory and
   an HTTP header. A client display name is never an identity.
2. `broker.callEditorTool` obtains a browser snapshot for `get_scene`. The browser
   captures source, revision, drag state and document identity synchronously.
   `ReadAccessRegistry` returns a random one-use read token scoped to that real
   client, editor session, document epoch and revision. Internal snapshots and
   partial inspector reads cannot authorize the caller.
3. Every source mutation requires the token and `expectedRevision`. The broker
   serializes work per editor, checks current source and consumes the token
   before preparation. `ToolSourcePolicy` classifies native `toCommand` actions
   and explicit transport mutations; aliases resolve through the same policy.
4. A private `BridgeJob.sourceAuthorization` carries the admitted document/revision
   to the browser. `assertEditorSourceAuthorization` checks it before work and
   again immediately before commit. Manual edits, document replacement at the
   same revision and active gestures invalidate stale work. Tool arguments cannot
   fabricate this private envelope.
5. Native commands receive `nativeToolArguments`, without transport authorization
   fields. Actual commits/undo/redo emit a bounded `SourceChangeSummary`. Source
   JSON and undo snapshots never contain tokens or connection state.

The public source caller contract is:

```ts
const read = await call('get_scene', { sessionId })
await call('update_layer', { sessionId, layerId, textColor: '#34d399',
  expectedRevision: read.revision, readToken: read.readToken,
  requestId: 'clock-color-1' })
```

Inspect `read.scene` and construct a focused change preserving current human
edits. On conflict, reread and adapt the payload; merely replacing the revision
on an obsolete snapshot defeats the caller's preservation responsibility.
Do not log or persist the read token. This example orchestrates tools; it is
not JavaScript to place inside `run_script`.

## Plans, batches, retries and ownership

- A normal token authorizes one mutation or outer native batch. The batch's
  sub-actions use `batchInputSchema`; they do not need separate read tokens.
- A script dry run consumes the ordinary token and reserves a new token bound
  to its `planId`. Commit the returned revision/token/plan without reexecuting
  code. Other reads do not revoke that reserved token. Source edits invalidate
  it through revision/document checks. The prepared scene/IDs remain in the
  existing bounded five-minute plan store.
- Only an exact retry with the same `requestId`, name and arguments may recover
  a result after token consumption. The cache holds 64 results per editor,
  keyed by actual client identity. `get_scene` always reads fresh, even with a
  repeated request ID. A reconnect has a new identity; unknown transport
  outcomes are not automatically replayed.
- Grants expire after five minutes, at most 512. A new ordinary read supersedes
  prior ordinary grants for the same client/editor. Client connections expire
  after 30 minutes idle, at most 64. Disconnect revokes grants and plans. Lazy
  cleanup has no timers/resources to dispose. Editor identity is a WeakMap over
  `EditorDocumentLifetime`'s AbortSignal, never a scene name or serialized field.
- Times above use epoch milliseconds. Revisions are nonnegative source revision
  integers; they are unrelated to playhead time. Tokens use cryptographic random
  32-byte hex; crypto and clock composition belong to the broker, not domain code.

`SourceAccessError` publishes fixed credential-free `code/message/recovery`
records across browser reply, HTTP and MCP structuredContent. A rejected command
does not change source or history. Reads, playback/runtime controls, previews,
exports and file saves need no source authority; load/import/normalize and
undo/redo do. Even a no-op script consumes authorization.

## Limits and migration

Rebuild/restart the editor and reconnect the STDIO client together for 2.0.0.
All old names remain callable, but old source payloads without authorization are
intentionally rejected. Scene format stays 1.x. Standard 40 / legacy 77 discovery
is unchanged. The catalog advertises `sourceEditing` and the required fields.

The change summary is diagnostic, not provenance/history: at most 100 entries
per category, 10,000 inspected values and bounded paths/depth. `truncated` means
incomplete. Dense geometry arrays are field changes; key records use stable IDs
when available. Legacy missing/duplicate IDs report truncation rather than
failing an already-committed operation. Large source reads/plans retain existing
protocol limits. Actor provenance is now owned by [editor/authoring](../../editor/authoring/README.md); the broker supplies its agent stamp through the private envelope. Semantic conflict choices and deep native patching remain separate work. E−1.4 identity-preserving key updates and local authoring rules are documented in [timeline-authoring](../../../../docs/tr/timeline-authoring.md).

Tests in this directory and `../__tests__/sourceAccess.test.ts`,
`sourceRoute.test.ts` cover identity/expiry, stale writes, manual child/key/path
preservation, document reset, drag, undo, aliases, batches, retries, plans and
the final browser race. Real STDIO acceptance scripts live under `scripts/`.
