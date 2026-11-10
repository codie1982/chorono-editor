# Chorono MCP catalog and compatibility

Chorono MCP 2.0.0 controls the connected editor through STDIO. The default
`standard` catalog exposes 40 common tools. All 77 original tool names remain
callable with their existing domain payload and default semantics. Source mutations now require the authorization envelope described below. Tool
discovery and call resolution are separate; this update does not replace the
editor's native commands or undo system.

For installation, local server setup and connection checks, see the
[installation guide](installation.md). The full [Turkish MCP reference](../tr/mcp.md)
covers persistence, audio, limits and security. The distributable authoring
instructions are [skills/chorono](../../skills/chorono/SKILL.md).

## Discover only what you need

1. Use `list_sessions` and read `get_scene` in the intended editor. Pass a
   `sessionId` explicitly when more than one tab is connected.
2. Use `get_capabilities({summary:true})` for the version, catalog metadata,
   object kind names, particle presets, limits and output support. It omits the
   full tool/property schemas and script help. Read `chorono://scripting` for
   authoring signatures.
3. Request one exact native schema with
   `get_capabilities({toolName:'configure_particles'})`. Do not combine
   `toolName` with `summary:true`. The response identifies the implementation and
   canonical names, whether the tool is advertised and `callableInBatch`; batchable tools also expose `batchInputSchema` without per-action authorization requirements.
4. For an advanced mutation with `callableInBatch:true`, put that exact name and
   its arguments inside advertised `batch_actions`. Discovery does not register
   another direct tool in the client's tool list. Read, file and transport tools
   cannot be nested in a mutation batch.

The original `get_capabilities({})` response still returns the full property
schemas, scripting reference and `tools` compatibility inventory of 77 original
names. Its `tools` array is not the current client's direct discovery surface.
Read `catalog: {version:1,profile,advertisedToolNames,aliases}` for that surface;
each alias is `{name,implementationName}`. `chorono://capabilities` remains the
full resource. Clients connected to an older server can continue using its
original full discovery call.

## Choose by purpose

| Task | Preferred standard tools |
| --- | --- |
| Read source and inspect records | `get_scene`, `list_layers`, `get_layer`, `list_timelines`, `get_timeline`, `list_assets` |
| Create or edit ordinary layers | `create_layer`, `update_layer`, `delete_layer`, `clone_layer`, `array_layer`, `group_layers`, `ungroup_layer`, `update_composition` |
| Create/edit animation | `create_timeline`, `update_timeline`, `upsert_keyframes` |
| Procedural work or native batches | `run_script`, `apply_script_plan`, `batch_actions` |
| Verify pixels/values/runtime | `render_preview`, `evaluate_frame`, `get_runtime`, `control_playback`, `control_runtime` |
| Check/save/reopen | `validate_scene`, `save_project`, `load_project`, `list_projects`, `undo`, `redo` |
| Media and output | `import_asset`, `export_runtime`, `export_svg`, `export_sequence`, `export_audio`, `render_audio_preview`, `get_audio_state` |

Native spline, particle, state-machine, advanced track and audio clip edits are
available through single-tool discovery and mutation batches, or directly in
the legacy catalog. Scripts also expose the existing domain handles. Specialized
tools have different purposes: spline primitives create editable topology;
ordinary shapes do not acquire editable point/handle data merely by looking alike.

## Renamed tools preserve their contracts

| Preferred name | Original implementation | Contract |
| --- | --- | --- |
| `create_layer` | `create_object` | Registry `kind` and optional layer `patch`. |
| `get_layer` | `describe_layer` | Read a formatted subset of one layer, not its complete nested model. |
| `get_timeline` | `describe_timeline` | Inspect one timeline's tracks and keys. |
| `upsert_keyframes` | `set_keyframes` | Explicit timeline/layer/property addressing; add or update keys, not replace the whole track. |
| `replace_layer_fields` | `patch_object` | Shallow replacement of supplied fields, including complete nested objects. |
| `evaluate_timeline_values` | `evaluate_at_time` | Timeline-only value evaluation. |
| `create_state_machine_state` | `add_sm_state` | Add a state. |
| `create_state_machine_transition` | `add_sm_transition` | Add a transition. |
| `set_state_machine_initial_state` | `set_initial_state` | Choose the initial state of one machine. |

Not every preferred name appears directly in the standard catalog; advanced
mutation names are discoverable for batches. `replace_layer_fields` does **not**
introduce recursive merging: use script `layer.patch` or a focused native command
when siblings must be preserved. `get_scene` returns revision/editor context;
legacy `get_scene_json` still returns only JSON. `evaluate_frame` includes
bindings, parameter wiring and runtime inputs, unlike the timeline-only helper.

Original `add_keyframes` keeps its target-path addressing and timeline
auto-create behavior. It is not an input-compatible spelling of
`upsert_keyframes`. Existing key upsert can replace nearby key metadata; this
catalog update is not the later identity-preserving key-edit feature. Read the
affected keys and preserve unrelated data.

For full effects, masks, particle or spline data, read the `get_scene` snapshot
or script `layer.data` before replacing nested fields. The `get_layer` summary
does not contain every field needed to preserve such data.

## Use an existing client's full tool list

Set `CHORONO_MCP_TOOL_PROFILE=legacy` in the **STDIO MCP server process**
environment when a client needs all original tools directly advertised. The
legacy catalog lists exactly the original 77 names with corrected descriptions
and schemas. The default is `standard`; unknown profile values fail at startup.
Changing the browser/Next environment alone does not select the client's STDIO
catalog. Reload or reconnect the MCP client after changing the build or profile;
do not assume automatic tool registration.

Both profiles resolve original names through the same implementation paths.
On a transport retry, reuse the same tool name, arguments and `requestId`.
Another alias is not an identical retry. Existing revision checks, active-drag
protection, script dry-run/commit plans and one-undo batching still apply.
Set `expectedRevision`, `readToken` and retry `requestId` on the outer
`batch_actions` call for the whole transaction; sub-actions do not authorize
separate writes. `normalize_audio_clip` is not batchable (`callableInBatch:false`)
and is omitted from the standard catalog. Use the legacy profile when this
standalone source-peak measurement is needed; scripts do not offer an equivalent
peak-measurement method.
## Mandatory source read and revision

Protocol **2.0.0 is a deliberate source-call migration**. Rebuild/restart the
editor and reconnect the STDIO MCP client together. Old names and profiles remain,
but neither bypasses required source authorization. Scene JSON stays unchanged.

1. Read `get_scene({sessionId})` in the same MCP connection. Inspect the current
   source, including manual changes; partial reads do not grant write access.
2. Submit the focused mutation with that read's `revision` as `expectedRevision`
   and its `readToken`. The token is one-use, valid for five minutes, and bound to
   the real client connection, editor session, document epoch and revision.
3. Read again before the next source mutation. A successful mutation does not
   authorize another write. On conflict, read and adapt; do not substitute a new
   revision into an obsolete full-scene payload.

Example tool arguments (not code inside a QuickJS script):

```js
const read = await call('get_scene', { sessionId });
await call('update_layer', { sessionId, layerId, textColor: '#34d399',
  expectedRevision: read.revision, readToken: read.readToken, requestId: 'color-1' });
```

For `run_script({dryRun:true,...})`, use the ordinary read authorization. The
response contains a **new plan-bound** `readToken`, `revision` and `planId` for
`apply_script_plan`. Commit those exact fields without rerunning the script.
Further reads do not revoke the reserved plan token, but intervening source edits
or document replacement invalidate the plan. A batch uses one outer read token.

All native source commands, scripts, project loading, media import, normalization
and undo/redo use this gate. Reads, runtime/playback controls, preview, exports
and saving a project do not change authored source and need no token. No-op
scripts still consume authorization. While a drag is active, source reads/writes
are refused until it completes. A final browser check catches edits that happen
after broker admission, including replacement by a document at the same revision.

Use a stable `requestId` with **identical tool name and arguments**, including
its token, for an uncertain transport retry in the same client connection.
The bounded cache retains up to 64 results per editor across clients. Reconnecting
creates a new identity; read the scene before deciding whether to retry. Never
record tokens in scene JSON, user logs or persisted project metadata.

Failures include structured `code`, `message` and `recovery`: missing/used/expired
read, revision conflict, changed document, busy editor or disconnected client.
Committed edits return a bounded `changeSummary` of added/removed/reparented
layers and changed paths/keys; `truncated:true` marks an incomplete summary.
This protects against stale writes; authoring provenance and semantic conflict
choices remain the later E−1.2 work. Existing shallow patch/key semantics still
apply; preserve unrelated nested settings and animation metadata explicitly.

## Verification scope

Catalog quality is checked against actual `tools/list`, schema acceptance and
shared dispatch behavior. Corrected descriptions do not establish a new Glama
score; a new external evaluation is needed. See the
[implementation plan](../tr/plans/mcp-tool-quality-plan.md) for the baseline and
acceptance boundaries.
