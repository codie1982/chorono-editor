# MCP tool discovery and call ownership

MCP protocol 2.0.0 separates **advertising** from **calling**. Public entry points
remain in `src/lib/mcp/catalog.ts`: `getToolCatalog(profile)`,
`getCallableTool(name)`, `validateToolCall(name,args)` and
`getCapabilities(profile,options)`. `ToolCatalogPolicy` supplies explicit aliases
and profile configuration; `ToolCatalogIndex` owns immutable metadata, not scene
state. It is composed once after `bootstrapMCPActions` from existing native
ActionRegistry definitions and transport/file extras.

`standard` advertises 40 earned workflows; `legacy` advertises the 77 original
names. Both can call every original name and nine new aliases. Only the STDIO
process reads `CHORONO_MCP_TOOL_PROFILE`; the browser's environment cannot choose
a client's discovery list. Invalid configuration fails startup. There is no
Glama-specific catalog, dynamic remote registration or second command engine.

The call path is STDIO validation → local broker → editor validation → existing
native command. Each boundary validates the supplied name against the complete
index, then resolves its implementation. Batch sub-actions do the same and
remain native mutations only. Alias and legacy paths share source revision,
active-transaction and atomic commit checks. Broker request deduplication hashes
the exact requested name/arguments; alias switching is a different retry. Batch
revision and retry controls belong to the outer transaction.

The pure quality decorator borrows definitions, clones JSON schemas and supplies
selection guidance, parameter meaning and conservative behavioral hints. The
index deeply freezes its own decorated output; ActionRegistry's schema is not
frozen or mutated. Lists return a fresh array over immutable records. Metadata
has no timers, native/browser handles or dispose obligation. AJV validators are
cached separately by callable name and cannot be changed through a read result.

```ts
const summary = await getCapabilities('standard', { summary: true })
const detail = await getCapabilities('standard', { toolName: 'add_spline' })
// detail.callableInBatch authorizes choosing a native batch shape, not source
// access: normal validation/revision/commit checks still run for every call.
await validateToolCall('create_layer', { kind: 'rect',
  expectedRevision: read.revision, readToken: read.readToken }) // read from get_scene
```

No-option capabilities preserve their former full `tools` inventory and script
help. `summary:true` omits those large fields; `toolName` returns exactly one
callable schema and routing metadata. These two opt-in modes are exclusive.
`catalog.advertisedToolNames` describes discovery independently from the legacy
inventory. Read the English/Turkish MCP guides and canonical authoring skill for
the actual native-batch workflow and migration.

Mandatory source authorization is owned by [source/](../source/README.md): client/editor/document/revision-bound one-use reads, private broker envelopes and final browser CAS. `validateToolCall(...,{withinBatch:true})` validates only a sub-action payload after outer authorization; it is not a transport bypass. AJV validators are keyed by name and direct/batch mode. Provenance remains separate.
It also does not change shallow replacement, timeline-only evaluation or legacy
key identity/collision rules merely because a clearer alias is available. E−1.4 separately implements exact-time identity/easing preservation in the common source upsert; the catalog documents that actual behavior.
Compatibility tests cover discovery, alias schema equality, legacy behavior,
dedupe, stale revisions, atomic failure/undo and typed input/clearing cases.
