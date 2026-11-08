# MCP tool contracts and definition quality

Chorono's MCP catalog describes the existing local editor operations. Its tool
names, accepted inputs and execution behavior are unchanged by the November 2026
description improvements. Glama TDQS evaluates the definitions, not animation
quality, runtime correctness or security. A new score requires a new Glama build
and evaluation; improved documentation alone is not a measured score increase.

## Metadata ownership

- `src/lib/ai/actions/` owns native action descriptions and parameter schemas,
  shared with the editor's AI adapter. `src/lib/mcp/actions.ts` owns the additional
  native MCP actions and reuses the existing commands/SceneAPI implementations.
- `src/lib/mcp/extraTools.ts` owns definitions for broker/editor-only operations:
  connection discovery, scripts, previews, playback, history and files.
- `src/lib/mcp/toolContext.ts` documents the shared broker parameters and native
  response envelope, without mutating the registered schemas. `catalog.ts`
  composes and caches the definitions used by both `tools/list` and input validation.
- `broker.ts`, `editor.ts` and `storage.ts` remain the implementation sources for
  connection/retry behavior, scene transactions and file ownership respectively.

Do not add descriptions only in a directory listing, a separate server fork or a
generated CLI skill. Update the owning definitions and canonical `skills/`
references together. `npm run cli:build` regenerates packaged skills.

## Connection and concurrency

`get_capabilities` can describe the server without a running editor. Other discovery
operations use the local server, but `list_sessions` and `list_projects` do not
require a paired browser. Scene operations require the running editor and a tab
explicitly connected with **MCP → Connect this editor**. With multiple tabs,
choose `sessionId` from `list_sessions`; one connected tab can be selected implicitly.

`expectedRevision` is a scene guard for authored mutations, scripts/plans,
undo/redo, project load and project save. It is not enforced for read-only tools,
playback/runtime controls or exports. Export `revision` identifies the captured
scene; specifying `expectedRevision` does not turn an export into a guarded write.
On a conflict, read the scene again and prepare new arguments for a fresh edit.

`requestId` is a retry token, not an asynchronous job identifier. In one connected
editor session, a repeated tool call with the identical arguments returns the
cached promise/result, including failures. Reusing an id with different arguments
fails. Only the last 64 tokened calls are retained in memory; disconnect/restart or
cache eviction removes that guarantee. Discovery ignores retry/revision fields.
Following an uncertain timeout, inspect the scene before deciding to retry.

Native commands, scripts and native batches each apply one undo transaction.
An invalid batch does not apply partial scene edits. Live runtime controls are
different: parameter changes apply sequentially, so a later error can leave an
earlier live value changed. Use `get_runtime` to inspect that state.

## Choosing a tool

| Goal | Use | Boundary |
| --- | --- | --- |
| Full scene records and concurrency revision | `get_scene` | `describe_layer` is a summary, not a full nested Layer record |
| Flat layer properties with a chosen id | `add_layer`, `update_layer` | `create_object`/`patch_object` use model-shaped nested data |
| Model-valued keys and custom Bézier easing | `set_keyframes` | `add_keyframes` keeps its legacy numeric input schema |
| Append a numeric signal modifier | `add_modifier` | `update_track` replaces arrays; `bake_track` replaces the authored stack with sampled keys |
| Live interactive values/events | `control_runtime` | `edit_entity` changes authored defaults/records |
| Pixel inspection | `render_preview` | `evaluate_frame` returns values, not an image |
| Editable portable source | `save_project` | Runtime JSON, SVG and PNG sequence are delivery formats |

Nested objects in `patch_object` replace existing nested objects. On this version,
`configure_particles` merges its top level and the first level of `emitter` and
`particle`; deeper objects/arrays replace existing values. Read full settings
before supplying those replacements. Modifier sine `frequency` counts cycles
over the normalized track/segment evaluation range; it is not a hertz value.
Baking defaults to 60 FPS and a normalized RDP tolerance of 0.005.

## Results and files

Native reads return MCP text containing JSON `{revision, content}`; `content`
is a string, sometimes itself JSON-encoded. Native mutations return text JSON
with `revision`, `composition`, layer/timeline summaries and `addedLayerIds`.
Bridge-only tools document their own result fields. `render_preview` returns
an image plus metadata text. Failed calls use `isError:true` with a text message;
some human-readable queries instead return explanatory content for missing ids.

There is no advertised `outputSchema` in this version. Do not declare one without
also supplying matching MCP `structuredContent` and verifying client compatibility.

`save_project` writes `<project root>/projects/<name>.chorono.json` by default,
or under `CHORONO_MCP_PROJECT_DIR`. Exports write to that directory's `exports/`
subdirectory. File names cannot contain paths or `..`. Results report the actual
absolute `path`, `bytes`, `sha256` and `revision`; exports also report `warnings`.
Only `save_project` accepts `overwrite:true`. Exports always need a fresh name.
Undo/redo affects scene history, not files. Empty undo/redo history is a no-op;
a new authored scene edit clears redo history.

SVG captures time zero unless `timeMs` is supplied, independently of the playhead.
It can skip unsupported layers, so inspect its warnings. PNG preview defaults
to the live playhead. Sequence export is a PNG ZIP, without audio/MP4 encoding,
limited to 300 frames, 4,194,304 pixels per frame and a 24 MiB ZIP.

## Minimal native workflow

Run these as MCP tool calls against an explicitly selected connected editor:

```json
{"name":"get_scene","arguments":{"sessionId":"<connected-editor-id>"}}
```

Use that response's `revision` and a unique request token for the new mutation:

```json
{
  "name": "create_object",
  "arguments": {
    "sessionId": "<connected-editor-id>",
    "expectedRevision": 0,
    "requestId": "create-hero-001",
    "kind": "circle",
    "patch": {"name":"Hero","opacity":0.8}
  }
}
```

Replace `0` with the actual revision, use the returned `addedLayerIds` for later
edits, inspect PNG previews and validate before `save_project`.

## Verification and re-evaluation

Run `npm test`, `npm run mcp:build` and `npm run build` with no Next server running
in that checkout. The contract tests cover parameter documentation, schema
ownership, revision/retry semantics and history behavior. Also inspect the actual
STDIO `tools/list` response: native UI metadata alone is not the published catalog.

When changing documentation, compare the full catalog before/after while excluding
`description`/`examples`. Tool names, validation keywords and annotations should
remain identical unless an intentional contract change is documented separately.

After the reviewed commit is merged, pin that commit in the free Glama Docker
configuration, run its build/introspection checks, publish a release and wait for
all tool definitions to be evaluated. Record the resulting score and per-tool
feedback; do not estimate or promise a score from local coverage counts.

References: [TDQS dimensions](https://tdqs.dev/dimensions),
[MCP tool results](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
