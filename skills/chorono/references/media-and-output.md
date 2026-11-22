# Assets, appearance and delivery

## Import and appearance

`import_asset` takes a file name, MIME type and base64 content, not an arbitrary local path or server-fetched URL. Read a user-authorized file using the host's file tools, encode its bytes, and send them through the import tool. Use returned asset/layer ids. Imported media appears in the real asset pipeline; examine the result before changing geometry or typography.

For fonts, import the actual supported font file, read the registered family from the asset metadata, then apply that family. Do not assume that a guessed font name loaded correctly. The pipeline supports WOFF, WOFF2, TTF and OTF. Check the current input size limits with `get_capabilities`.

`Layer.font`, `Layer.stroke` and `Layer.shapeParam` expose typography, strokes, geometry and appearance. Advanced native `replace_layer_fields` (legacy `patch_object`) accepts Layer fields through its discovered schema and `batch_actions`. For effects, masks, gradients, blend modes, repeaters and nested typography, inspect the property schema and `layer.data` first. Use `layer.patch` for recursive object merging. `Layer.set` and `replace_layer_fields` replace nested objects and can remove omitted fields.

## Basic Shape image paint and composition background

Discover the connected property schema first. Fill modes are `solid`, `gradient`, `image`, `none`; stroke has explicit `solid`, `gradient`, `none` with legacy omission preserved. Image paint uses a registered **image asset ID**, not a URL, file path or video. Example serializable fill:

```json
{"type":"image","image":{"version":1,"assetId":"RETURNED_IMAGE_ASSET_ID","fit":"cover","offsetX":0,"offsetY":0,"scale":1,"rotationDeg":0}}
```

`fit` is `cover`, `contain` or `fill` (UI Stretch). Offsets are layer-local pixels, scale a positive uniform factor, rotation clockwise degrees around the local paint-box centre after fitting. Offset/scale/rotation have numeric property paths `style.fill.image.*`; source asset and fit stay static. `none` is transparent and retains inactive payloads/keys. The editor's Import image paint button registers the image and assigns paint in one Undo without inserting an Image layer. MCP `import_asset` retains its normal layer insertion behavior; do not promise the new UI action as an MCP tool. For procedural edits use `layer.patch({style:{fill:...}})` through the existing read/revision/script-plan workflow and preserve inactive fields read from source; do not replace sibling stroke/style or existing keys.

Composition source uses `composition.backgroundFill` with the same fill payload and `composition.backgroundInExport` (default true); legacy `backgroundColor/backgroundGradient` still load. `backgroundInExport:false` keeps the editor background but excludes it from PNG, frame sequences, SVG and runtime/HTML source. Explicit export colors override it. Portable editable saves keep both settings. SVG's async output embeds imported blob-backed paint assets; a missing source rejects export explicitly. Static SVG evaluates the selected time. Animated SVG supports outer transform/opacity as before; animated internal image placement is frozen and warned. Inspect actual previews/exports; do not claim video fill, UV mapping or external native-player compatibility from this paint feature.

## Native spline sub-object editing

One selected spline exposes Point / Edge / Object in the separate Spline & Boolean panel,
plus viewport right-click entries. Object means an existing SubShape, including
its contours/holes. Point coordinates/handles, Edge line/curve type and Object
name/contour status have separate native inspectors. Done returns to outer layer
Properties/shared paint. Selection state is transient and never enters scene
JSON. Native source edits reject competing keyed/wired coordinates instead of
replacing evaluated poses. Existing source IDs, keys and times remain intact.
Headless MCP edits use explicit mode/IDs, not a persistent UI editing context.
Do not manufacture mode fields in serialized spline data. In native editing, Add
appends a fresh SubShape; Done restores separate-layer Add. Continue requires one
selected open endpoint. Local sub-object Move/Rotate/Scale, independent shared
Fill/Stroke and remembered Auto Close are available. In the editor Line tool,
right-click closes placed anchors when Auto Close is on (three anchors minimum);
when off it finishes open. Enter finishes open and Escape cancels. The preference
is shown in the separate Spline & Boolean panel before the first point. Start-point
acquisition also uses a 10 CSS-pixel
radius and at least three anchors. Native Topology now supports Attach/Detach/Copy, Join/Connect/Weld, Refine/Divide
and mode-owned Delete. Attach consumes a static, unreferenced source and uses
the active layer paint; Detach preserves outer tracks on a sibling. Unsafe
geometry drivers/references reject with a reason. The same source operations,
plus Offset/Chamfer/Fillet and owned Boolean recipes, are available through the
[native plan workflow](spline-editing.md). UI gestures, panel mode and global
Auto Close/snap preferences are not script-controlled scene data.

## Boxed 3D models

In the editor, use Layers → Add → **3D Objects → Import GLB / glTF**. With camera editing off, the Select tool's eight handles resize the 2D box; Properties → **2D Model Box · px** edits the same width/height. Box dimensions remain distinct from internal model scale and camera framing. A small original sample is shipped at `examples/3d/chorono-robot.glb`.

Import GLB 2 or self-contained glTF 2 with `import_asset`, MIME `model/gltf-binary` or `model/gltf+json`. Send raw base64 bytes, not a path or data URL. The encoded input limit accommodates a 16 MiB raw model; the importer still checks decoded size and workload. The result creates a `model3d` asset and layer through the native import transaction. Use its `addedLayerIds`, then read `get_scene` for the asset id and complete `Layer.model3d` before editing. The first slice has bounded decoded preparation, embedded PNG/JPEG/WebP textures, imported materials and default pose. External companion files, compressed codecs and rig/weight/IK authoring are unsupported; import errors/warnings are explicit. Native embedded clip playback is available in Edit content after explicit part-editing promotion.

The outer `Layer.transform` remains 2D composition pixels. `model3d.position/rotation/scale` affect the internal model; rotation is degrees. Presentation framing normalizes the imported bounding sphere to radius one under a wrapper, preserving original node transforms. `model3d.camera` uses yaw/pitch degrees, distance, targetX/Y/Z and fov. Use `update_model3d` to deep-merge static model pose, camera and lighting, with optional `box.width/height` in 2D pixels; discover its exact schema with `get_capabilities({toolName:'update_model3d'})`. It keeps the asset id, source version, omitted fields, outer transform and tracks. Read `get_scene` immediately before the edit and pass its revision/readToken. For example, `{layerId:'MODEL_ID',patch:{rotation:{y:30},camera:{yaw:45}},box:{width:600}}` changes only those values. Thin instances must be edited through their source layer id. The viewport control strip's explicit **3D camera** toggle changes saved output framing; it is not an inspection-only view. Its off state retains ordinary 2D movement. Driven camera source gestures/reset refuse rather than erase keys/bindings/expressions. Imported clips stay in the source asset and are not expanded into Timeline tracks by this slice.

**2D key scope:** animate only the outer layer (2D position/rotation/scale/opacity and supported outer compositing fields). Internal `model3d.*` placement/camera/light fields remain available as static Properties; never key them through `Layer.key`, `Timeline.key` or keyframe tools on the main 2D Timeline. Native authoring rejects those targets. Existing saved internal tracks are preserved for round-trip/evaluation compatibility but excluded from 2D authoring views and bulk clear. The native UI now offers a shared static content detail host for Shape, Bezier Path and model placement: Layers/Explorer/viewport right-click → Edit content; shape/model viewport double-click also opens it. Path double-click keeps the existing Pen behavior. Apply is one source Undo; Cancel preserves source; any intervening source revision blocks stale Apply. This is a native UI workflow, not a new MCP tool. For model content, the native detail UI now has a private **Content Timeline**: create/select/name clips, set duration/loop/default clip, key numeric placement/camera channels, edit Keys/Curve, and Apply/Cancel. Main 2D keys are not copied there. Inspector edits with a clip selected write keys at its local playhead; lighting stays static. The first authored clip upgrades only `model3d.version` to 2; unedited v1 models stay v1. Generic patches cannot replace private clips or write their owned base channels; use Edit content. This manual UI capability is not a new MCP/script method. Never manufacture a public inner-context flag or overwrite clip JSON to bypass it. The native detail editor now supports explicit v3 part editing: SHA-256/index-bound node tree and XYZ translation, separate inspection/output cameras with orthographic presets, per-instance PBR overrides using existing embedded UV/texture slots, native skeleton/morph clip select/play/scrub/in-out/speed/loop, private node/visibility/native-time keys, up to eight shared-depth model slots, exposed typed Wire/expression inputs, turntable and assembly explode. Native-owned channels cannot gain a competing authored writer. Inspection never saves the output camera without Use view for output. Apply/Cancel remains one main Undo; a newer source revision blocks Apply. Thin instances may own only exposed input values (`model3dInputValues`), with source definitions retained. Full rig editing, external HDRI/texture import and UV authoring remain separate. These are native UI capabilities: do not invent MCP node/clip/structural mutation methods or overwrite private content JSON.

The native Modeling detail view now separates **Polygon / Primitive** and **Spline Extrusion**. Polygon mode can add, select, edit and remove Box, Sphere, Cylinder and Cone objects within the same 3D scene. Their authored source is `model3d.version:4` / `modeling.version:1`; local Undo/Redo, Apply/Cancel, portable save/load and raster output use the existing model detail lifecycle. Spline Extrusion is a visible future mode without mesh creation. Editable-poly topology and modifier stacks are not available yet. MCP/scripts cannot add or change primitive structure; use the native editor and do not invent a structural MCP method.

Use prepared raster previews/image sequences and portable source. Basic/native runtime and standalone HTML exports reject boxed 3D; SVG reports unsupported-layer warnings. Internal surfaces cap the long side at 2048 pixels in this first slice. Never promise imported camera selection, full rig/IK editing, 3D physics or a separate full 3D workspace. Native clip playback and scoped private key editing do not imply bone-curve import to the main Timeline.

## Save and export

| Goal | Tool and behavior |
| --- | --- |
| Editable portable project | `save_project`; local blob media is embedded and the scene remains editable |
| Reopen existing work | `list_projects`, then `load_project` by project name |
| Clean frame for inspection | `render_preview`; returns actual PNG image content |
| Runtime playback data | `export_runtime`; preserves visual layers/visibility, embedded assets, timelines, parameters, wires, state machines and initial state. Physics ownership/recipes stay source-only because committed bake playback is carried by ordinary tracks. Inspect optimization and validation diagnostics. |
| Vector still | `export_svg`; report unsupported-feature/export warnings |
| Frame sequence | `export_sequence`; ZIP of images, bounded workload, no audio |
| Preferred final 2D output | `render_2d` with `backend:'auto'`; transfers to Chorono Render when available, otherwise writes built-in PNG/PNG-sequence output |
| Audio preview | `render_audio_preview`; real stereo PCM WAV plus peak/RMS/clipping, up to 10 seconds |
| Audio mix | `export_audio`; stereo PCM WAV with gain automation, fades, pan and master gain, up to 120 seconds / 24 MB |

Use the returned absolute path instead of inventing an output location. Only `save_project` accepts `overwrite:true`; exports never replace existing files, so use a fresh basename. Saved projects live under the configured project directory, with exports in its `exports/` subdirectory. Undo/redo affects scene history, not files. SVG defaults to time zero regardless of the live playhead; supply `timeMs` for a different vector frame and inspect all warnings.

Output work also shares the editor's managed resource budget and finite queue.
Complex geometry, dense runtime baking or large JSON/media copies can be refused
before allocation even when a tool's outer frame/duration/transport cap allows
them. These are admission policies, not a hard limit on native/browser process
RAM. Do not treat quota errors as permission to truncate data or silently lower
quality. Cancellation may keep a non-abortable encoder, renderer or consumer
active until it actually settles; the resource panel shows pending/protected and
failed-cleanup state. Legacy raw output helpers do not manage caller retention.

At this implementation version, a built-in MCP sequence call is bounded to 300 frames, 4 MP per frame and 24 MB ZIP output. A 10-second sequence at 30 FPS reaches 300 frames. `render_2d` with `backend:'auto'` first probes the authenticated same-origin Chorono Render bridge: a connected service receives a PNG frame archive and owns final PNG/MP4 encoding; if it is absent, the built-in path writes PNG or a PNG-sequence ZIP. Use `backend:'chorono'` when absence must be an error and `backend:'builtin'` when external transfer is unwanted. Chorono video transfer accepts at most 1,800 frames, 4,096 px per dimension and even MP4 dimensions. Audio mixdown remains a separate WAV operation; current `render_2d` does not mux it into video.

## Editable audio clips

`import_asset` places audio in the requested/current timeline at `startMs` or the current playhead. `add_audio_clip` reuses an existing audio asset. Keep the returned clip id. An audio layer is one non-destructive clip: layer `startMs/endMs` are placement; `audio.startOffsetMs` is source-in. New clips have `audio.timelineId`; legacy clips without ownership are project audio.

Use `move_audio_clip`, `trim_audio_clip`, `split_audio_clip`, `set_audio_gain`, `set_audio_fades` and `patch_audio_clip`. Discover their exact schemas with `get_capabilities({toolName:...})` and use `batch_actions` in the standard catalog, or direct tools when the legacy profile advertises them. These share native editor commands and undo. Never use generic layer stretching for an audio trim. A left trim advances source-in; move preserves source-in; split shares the asset and preserves gain/fade continuity. Explicit timeline clones share existing objects/clips like visual layers; duplicate a clip for independent settings.

Inside a procedural script, `scene.audioClip(assetId,{timelineId,startMs,name})` reuses an imported asset. Layer handles expose `audioGain(gainDb,{timeMs,timelineId})`, `audioFades({fadeInMs,fadeOutMs})`, `moveAudio(startMs,options)`, `trimAudio({startMs,endMs},options)` and `splitAudio(timeMs,options)`. The split returns the right-hand handle; all use the same native audio commands. Read signatures before calling and supply a key time for animated gain. File import and WAV rendering remain separate MCP operations.

Gain is linear in project data (`audio.volume`, 0..4); use `set_audio_gain` for dB. 0 dB = 1, about -6.0206 dB = 0.5. Mute is separate and preserves the gain setting. `audio.pan` is -1..1; `fadeInMs/fadeOutMs` multiply gain automation. Use `upsert_keyframes` (legacy `set_keyframes`) with `audio.volume` on the owning timeline for envelopes. Split/move can preserve negative-time audio gain support keys; leave them intact to retain the audible easing curve.

`get_audio_state` reports actual live sources, decode failures and meters. `render_audio_preview` creates a playable WAV and measured levels; a PNG or `evaluate_frame` cannot verify sound. Specify `timelineIds` for deterministic state-machine previews. After editing, listen to representative WAVs, check clip timing and measured gain, then save the portable project. `normalize_audio_clip` measures the trimmed source peak (default -1 dBFS) and adjusts static gain; remove gain automation first. `set_audio_master` saves master gain/mute. WAV warnings report output clipping or silence. Runtime JSON is not a mixed soundtrack.

Normalization is a standalone editor measurement, not a batchable native
mutation: `normalize_audio_clip` reports `callableInBatch:false` and is directly
advertised only in the legacy catalog. Do not place it inside `batch_actions`
or invent a script peak-measurement method. Other native clip edits still use
the discovered batchable commands described above.

Run `validate_scene` and inspect representative image previews before saving the final handoff. A successful JSON save does not prove that media loaded, text fits or the animation loops cleanly.
