# Assets, appearance and delivery

## Import and appearance

`import_asset` takes a file name, MIME type and base64 content, not an arbitrary local path or server-fetched URL. Read a user-authorized file using the host's file tools, encode its bytes, and send them through the import tool. Use returned asset/layer ids. Imported media appears in the real asset pipeline; examine the result before changing geometry or typography.

For fonts, import the actual supported font file, read the registered family from the asset metadata, then apply that family. Do not assume that a guessed font name loaded correctly. The pipeline supports WOFF, WOFF2, TTF and OTF. Check the current input size limits with `get_capabilities`.

`Layer.font`, `Layer.stroke`, `Layer.shapeParam` and `patch_object` expose typography, strokes, geometry and appearance. For effects, masks, gradients, blend modes, repeaters and nested typography, inspect the object property schema and current nested data first. A partial nested replacement can remove fields; merge the fields that must survive.

## Save and export

| Goal | Tool and behavior |
| --- | --- |
| Editable portable project | `save_project`; local blob media is embedded and the scene remains editable |
| Reopen existing work | `list_projects`, then `load_project` by project name |
| Clean frame for inspection | `render_preview`; returns actual PNG image content |
| Runtime playback data | `export_runtime`; inspect optimization and validation diagnostics |
| Vector still | `export_svg`; report unsupported-feature/export warnings |
| Frame sequence | `export_sequence`; ZIP of images, bounded workload, no audio |

Use the returned absolute path instead of inventing an output location. Existing files require explicit overwrite; choose a fresh name when the user has not requested replacement. Saved projects live under the configured project directory, with exports in its `exports/` subdirectory.

At this implementation version, a sequence call is bounded to 300 frames, 4 MP per frame and 24 MB ZIP output. A 10-second sequence at 30 FPS reaches 300 frames. Query the connected capabilities before planning a large output. The MCP exporter does not currently encode MP4, GIF or WebM or mix audio; do not promise those formats. If the user requires them, explain the additional encoder step and use a separately available, authorized workflow.

Run `validate_scene` and inspect representative image previews before saving the final handoff. A successful JSON save does not prove that media loaded, text fits or the animation loops cleanly.
