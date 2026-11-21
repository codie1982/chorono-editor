# Choose a native tool

Use the tool names actually advertised by the connected MCP client. In MCP
2.1.0 the default `standard` catalog exposes 58 focused tools; older clients or
the `legacy` profile may advertise the original names. The `tools` array in
`get_capabilities({})` remains the original compatibility inventory. For the
current discovery surface, use `get_capabilities({summary:true})` and read
`catalog.advertisedToolNames` and `catalog.aliases`. Request one schema with
`get_capabilities({toolName:'...'})` rather than fetching every tool definition.
`summary:true` and `toolName` are alternative discovery modes, not combined
arguments. Script signatures remain in `chorono://scripting`.

| Goal | Preferred standard tool | Important distinction |
| --- | --- | --- |
| Read current editable source | `get_scene` | Includes scene revision and editor context. Legacy `get_scene_json` returns only scene JSON. |
| List or inspect layers | `list_layers`, `get_layer` | Find ids and read a formatted summary. Legacy inspection is `describe_layer`; neither returns every nested Layer field. |
| Inspect one timeline | `get_timeline` | Reads its tracks and keys. Legacy name is `describe_timeline`. |
| Create a registered layer kind | `create_layer` | Takes the existing registry `kind` and optional layer `patch`; legacy name is `create_object`. Use real kinds from capabilities. |
| Change an ordinary exposed layer field | `update_layer` | Uses flat named fields such as `fillColor`; preserve other data. It is not a generic recursive object patch. |
| Add or update typed keys | `upsert_keyframes` | Takes explicit `timelineId`, `layerId`, `property` and `keyframes`; legacy name is `set_keyframes`. It does not replace the entire track. |
| Verify evaluated values | `evaluate_frame` | Includes bindings, parameter wires and runtime inputs. Legacy `evaluate_at_time` / `evaluate_timeline_values` is timeline-only. |
| Verify pixels | `render_preview` | Produces actual PNG content; evaluated values alone do not prove appearance. |
| Start a deliberately empty editable scene | `clear_scene` | Clears layers and timelines together with dependent physics, runtime and authoring records in one undo step. It preserves composition settings, assets, asset collections and editor guides. |
| Build/edit Mesh2D | `create_mesh2d_from_source`, `regenerate_mesh2d`, `set_mesh2d_texture`, `set_mesh2d_pins`, `set_mesh2d_deformation` | Fixed topology, appearance placement, pins and deformation reference are separate contracts. |
| Review and bake rigid/fracture simulation | `prepare_rigid_body_bake` or `prepare_voronoi_fracture_bake`, then `get_bake_job`, `preview_bake_job` and `commit_bake_job` | Prepare binds a fresh source read but does not edit it; commit needs another fresh source read. For Re-bake pass `replaceRecordId`, inspect with `inspect_physics_bake`, and set `replaceEdited:true` only for an explicit destructive choice. `clear_physics_bake` is separately undoable. None are native batch sub-actions. |
| Final 2D render | `render_2d` | `auto` prefers Chorono Render and falls back to built-in PNG/PNG-sequence output. It does not mutate source. |
| Read or test live behavior | `get_runtime`, `control_runtime` | Runtime state/parameters are separate from saved authoring definitions. |

The compatibility calls `bake_rigid_bodies` and `bake_voronoi_fracture` still
prepare and publish in one request. Prefer the persistent prepare/status/preview/
commit workflow whenever a person or agent must inspect the dense result, cancel
it independently, or surface it in the editor's Jobs & Bake queue. A bake job id
is private to the creating MCP connection and paired editor session.

Use `clear_scene` only when the requested workflow needs a true fresh start. Do
not emulate it by deleting visible layers alone: that can leave dependent bake,
runtime or provenance data behind. The command is undoable as one source edit;
read `get_scene` again before the next mutation.

Voronoi accepts either a fixed-time trigger or a qualifying impact against
explicit static colliders. Impact jobs must be reviewed after the Worker has
recorded exact contact evidence; they cannot commit an unresolved placeholder.
Optional explosion settings add deterministic one-shot radial/directional
velocity and spin, and must be presented as artistic external energy rather
than natural collision force.

Committed bake lifecycle is ownership-guarded. Read `inspect_physics_bake`
before Re-bake or Clear. Untouched output can be replaced or cleared directly;
fracture inspection also exposes its atomic topology event and exact-event
render/collider quality, so validate those metrics together with rendered PNGs.
edited, incomplete or legacy output refuses by default. `replaceEdited:true` on
the first `commit_bake_job` call or `discardEdited:true` on
`clear_physics_bake` is an explicit destructive decision. Duplicate targets or
layer ids remain blocked because ownership is ambiguous. Both mutations require
a new `get_scene` authorization and create one undo step.

Before preserving or replacing nested effects, masks, particle or spline data,
read the complete source through `get_scene` (or `layer.data` inside a script).
The `get_layer` summary is useful for inspection but is not a complete record
from which to reconstruct that nested data.

For an advanced native edit not advertised directly, request
`get_capabilities({toolName:'configure_particles'})` (or the exact intended
name). The result gives that callable schema, implementation/canonical names,
whether it is advertised and `callableInBatch`. When `callableInBatch:true`,
include the operation in advertised `batch_actions` using its exact name and
arguments. Discovery does not dynamically add a tool to the client's list.
Read/file/transport operations cannot be nested in a mutation batch. Use the
advertised read/export tool or the legacy profile when a required standalone
operation is unavailable.

Put `expectedRevision` and retry `requestId` on the **outer** `batch_actions`
call. They cover the whole atomic transaction; common fields inside individual
sub-actions do not establish independent revision checks. `normalize_audio_clip`
is a standalone measurement/editor operation, not a batchable native mutation.
Its `callableInBatch` is false; an operator can select the legacy catalog when
this direct normalization tool is needed. The script API does not measure source
peaks as an equivalent replacement.

Specialized operations remain useful when they express a different workflow:
for example native spline primitives produce editable point/handle topology,
while general shapes do not. Discover `add_spline` and invoke it through a
batch when using the standard catalog; procedural construction may instead use
`scene.addSpline` through `run_script`. Do not convert a shape into an assumed
editable spline merely because their rendered outlines look alike.

`replace_layer_fields` is the clearer name for legacy `patch_object`; both
replace supplied nested objects rather than merging their leaves. Discover its
schema before a batch, read the complete affected record and preserve omitted
siblings. For a safe recursive merge, use script `layer.patch` or a focused
native command. The rename does not introduce a new deep-patch operation.

Names do not change semantics: legacy `add_keyframes` still has its own target
addressing and timeline auto-create behavior; it is not an interchangeable
spelling of `upsert_keyframes`. Exact-time upsert preserves IDs and omitted curve metadata; nearby fractional
keys stay separate. Legacy add_keyframes retains its easeInOut insertion default;
structured upsert defaults new keys to linear. Follow [collaborative-editing.md](collaborative-editing.md) when
preserving hand-edited keys.

All canonical and historical source mutations require `expectedRevision` and the one-use `readToken` from `get_scene`; plan commit uses its dry-run token. Put these on the outer batch only; use `batchInputSchema` for sub-actions. On an uncertain retry, keep the **same tool name, arguments (including token) and requestId**.
Switching to another spelling is not an identical retry. Catalog/profile changes
require reconnecting the MCP client; ask the operator to select the legacy
profile only when the workflow needs its direct tool list. Normal authoring does
not require changing local configuration.

`get_scene` preserves optional source attribution in `scene.authoring`; `get_layer` adds descriptive self/subtree contribution information. Actor metadata is not a write permission. Missing provenance stays unknown.
