# Assets, appearance and delivery

## Import and appearance

`import_asset` takes a file name, MIME type and base64 content, not an arbitrary local path or server-fetched URL. Read a user-authorized file using the host's file tools, encode its bytes, and send them through the import tool. Use returned asset/layer ids. Imported media appears in the real asset pipeline; examine the result before changing geometry or typography.

For fonts, import the actual supported font file, read the registered family from the asset metadata, then apply that family. Do not assume that a guessed font name loaded correctly. The pipeline supports WOFF, WOFF2, TTF and OTF. Check the current input size limits with `get_capabilities`.

`Layer.font`, `Layer.stroke` and `Layer.shapeParam` expose typography, strokes, geometry and appearance. Advanced native `replace_layer_fields` (legacy `patch_object`) accepts Layer fields through its discovered schema and `batch_actions`. For effects, masks, gradients, blend modes, repeaters and nested typography, inspect the property schema and `layer.data` first. Use `layer.patch` for recursive object merging. `Layer.set` and `replace_layer_fields` replace nested objects and can remove omitted fields.

## Save and export

| Goal | Tool and behavior |
| --- | --- |
| Editable portable project | `save_project`; local blob media is embedded and the scene remains editable |
| Reopen existing work | `list_projects`, then `load_project` by project name |
| Clean frame for inspection | `render_preview`; returns actual PNG image content |
| Runtime playback data | `export_runtime`; inspect optimization and validation diagnostics |
| Vector still | `export_svg`; report unsupported-feature/export warnings |
| Frame sequence | `export_sequence`; ZIP of images, bounded workload, no audio |
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

At this implementation version, a sequence call is bounded to 300 frames, 4 MP per frame and 24 MB ZIP output. A 10-second sequence at 30 FPS reaches 300 frames. Audio mixdown is a separate WAV operation; image sequences have no soundtrack. Query connected capabilities before a large output. MP4/GIF/WebM encoding and video/audio muxing require an additional encoder workflow.

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
