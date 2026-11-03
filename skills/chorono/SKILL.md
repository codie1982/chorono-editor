---
name: chorono
description: Create, edit and preview editable 2D animations in a connected Chorono editor through its MCP tools. Use for Chorono scenes, objects, timelines, particles and interactive animations.
---

# Chorono authoring

Use the real Chorono MCP connection to keep the result editable in the user's editor. Installing this skill alone does not start the editor. If setup or connection is needed, use `chorono-setup` when available or follow [connection.md](references/connection.md). For an already connected editor, continue directly with authoring.

## Read and build

1. Call `list_sessions`, choose the intended editor, and read `get_scene`. If more than one tab is connected, include `sessionId` in every call. Preserve unrelated objects and animations.
2. Read `get_capabilities` and the `chorono://scripting` resource. These describe the connected version's actual tool schemas, object kinds, properties, particle presets and limits. MCP clients may prefix tool names with the server name. Do not invent method or property names.
3. Translate the brief into named objects, canvas dimensions, timing and output. Infer routine choices; ask only when a missing requirement changes the result materially. Check existing composition settings before changing them.
4. Prefer a native tool for a narrow edit, `batch_actions` for related native edits, and `run_script` for procedural construction. Give objects meaningful names and reuse returned ids.

Pass the last scene `revision` as `expectedRevision` on mutations. For a transport retry, reuse a stable `requestId` with the identical payload. After a revision conflict, read the changed scene and adapt; blindly resubmitting can overwrite manual work.

For generated scripts, use `run_script({code, dryRun:true, ...})`, inspect the returned plan, then call `apply_script_plan` with its `planId`. Commit the plan instead of executing the script a second time: it preserves generated ids. A plan expires and becomes invalid when the scene changes. Re-plan from the latest scene when necessary.

Generated scripts run only through the isolated MCP sandbox. It exposes synchronous authoring operations, not per-frame callbacks, browser APIs, Node, files or network. Use the host's file-reading tool to prepare an authorized import; do not try to escape the script sandbox. Do not send generated code to the legacy manual Script Console.

## Choose the relevant reference

- Read [animation.md](references/animation.md) for keyframes, multiple timelines, modifiers, cloning, paths and procedural scripts.
- Read [interaction.md](references/interaction.md) for state machines, runtime events, parameters, bindings and wiring.
- Read [media-and-output.md](references/media-and-output.md) for asset import, typography, effects, masks, portable projects and exports.

`patch_object` and `Layer.set` replace nested objects. Read existing nested values and preserve fields that the requested edit does not change. Use capability schemas for geometry, typography, effects, masks and repeater structures.

## Preview, refine and deliver

Inspect actual `render_preview` images at meaningful timestamps: before and after a reveal, peak movement, transitions and the loop boundary as applicable. Check text fit, contrast, occlusion and timing. `evaluate_frame` proves numeric values, not visual quality. Fix visible problems before delivery.

Use explicit `timelineIds` to preview individual animations. For a live state-machine screenshot, omit time/timeline/parameter overrides. When testing a deterministic timestamp in a state-machine scene, specify `timelineIds` so the preview does not reset the machine to its initial state.

After testing, pause playback and disable runtime test ticks if you enabled them. Restore the user's animation isolation with `control_playback({action:'pause',timelineIds:[]})` unless a specific isolated preview is part of the requested handoff.

Call `validate_scene`, address relevant diagnostics, and `save_project`. Report the actual saved path, the animations created or changed, inspected preview times and material export warnings. Do not claim MP4 or audio output from the frame-sequence exporter.
