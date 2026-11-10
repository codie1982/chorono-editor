---
name: chorono
description: Create, edit and preview editable 2D animations in a connected Chorono editor through its MCP tools. Use for Chorono scenes, objects, timelines, particles and interactive animations.
---

# Chorono authoring

Use the real Chorono MCP connection to keep the result editable in the user's editor. Installing this skill alone does not start the editor. If setup or connection is needed, use `chorono-setup` when available or follow [connection.md](references/connection.md). For an already connected editor, continue directly with authoring.

## Read and build

1. Call `list_sessions`, choose the intended editor, and read `get_scene`. At the start of each new follow-up editing turn, read that editor's scene again before preparing edits, even if this chat created it. The live scene is authoritative over earlier scripts, screenshots and chat memory. If more than one tab is connected, include `sessionId` in every call. Preserve unrelated objects and animations. Optional `scene.authoring` (version 1) distinguishes creation, field writers and inherited copy content; absent records are unknown. It never grants permission to overwrite manual work.
2. Use `get_capabilities({summary:true})` for lightweight discovery and read `chorono://scripting` for authoring. Discover a particular native schema with `get_capabilities({toolName:'...'})`; use the full `get_capabilities({})` when you need all property schemas or are connected to an older version without summary discovery. MCP clients may prefix tool names with the server name. Do not invent method or property names.
3. Translate the brief into named objects, canvas dimensions, timing and output. Infer routine choices; ask only when a missing requirement changes the result materially. Check existing composition settings before changing them.
4. Prefer an advertised native tool for a narrow edit, `batch_actions` for related native edits, and `run_script` for procedural construction. The standard catalog is deliberately smaller than the compatibility inventory. Read [tool-choice.md](references/tool-choice.md) when choosing between native alternatives or using an advanced tool. Give objects meaningful names and reuse returned ids.

Before **each source mutation**, read `get_scene` in this MCP connection/editor and pass its `revision` as `expectedRevision` plus its one-use `readToken` (five-minute lifetime). Inspect current manual edits and preserve unrelated fields. A successful mutation does not authorize the next write; read again. Put authorization and retry `requestId` on the outer `batch_actions` call only; its sub-actions use `batchInputSchema` and need no separate read. Reads, runtime/playback, preview/export and saving do not require source authorization. For an uncertain transport retry, reuse a stable `requestId` with the identical tool name and arguments, including the token. On conflict read and adapt; never substitute only a newer revision/token into an obsolete full-scene edit.

For generated scripts, authorize `run_script({code, dryRun:true, expectedRevision, readToken, ...})`, inspect the returned plan and bounded `changeSummary`, then call `apply_script_plan` with its `planId`, `revision` as `expectedRevision`, and the **new plan-bound `readToken` returned by the dry run**. Commit the plan instead of executing the script a second time: it preserves generated ids. A plan expires and becomes invalid when the scene changes. Re-plan from the latest scene when necessary.

Generated scripts run only through the isolated MCP sandbox. It exposes synchronous authoring operations, not per-frame callbacks, browser APIs, Node, files or network. Use the host's file-reading tool to prepare an authorized import; do not try to escape the script sandbox. Do not send generated code to the legacy manual Script Console.

## Choose the relevant reference

- Read [collaborative-editing.md](references/collaborative-editing.md) when continuing or revising existing work, especially after manual changes, uncertain retries or overlapping edits.
- Read [animation.md](references/animation.md) for keyframes, multiple timelines, modifiers, cloning, paths and procedural scripts.
- Read [domains.md](references/domains.md) for particle configuration and life channels, spline points/handles/contours, and Scene Explorer hierarchy queries and edits.
- Read [interaction.md](references/interaction.md) for state machines, runtime events, parameters, bindings and wiring.
- Read [media-and-output.md](references/media-and-output.md) for asset import, typography, effects, masks, portable projects and exports.

For code-driven scene design, read the complete scene with `scene.snapshot()`, a complete layer with `layer.data`, or one field with `layer.get(path)`. Collection getters and `Timeline.data` return detached copies; mutating those copies does not edit the scene. Prefer `layer.patch(partial)` to merge nested settings while preserving unspecified fields. `replace_layer_fields` (legacy `patch_object`) and `Layer.set` retain shallow replacement behavior. Use capability schemas for geometry, typography, effects, masks and repeater structures.

Use the domain handles for structured edits: `layer.particles` validates emitter/preset/life/modifier settings, `layer.spline` preserves native topology and locks, and `scene.explorer` queries and edits the actual hierarchy. Use returned element/group ids. Instance domain data is readable; modify its source explicitly. These APIs operate on editable scene data and do not control ephemeral panel selection/collapse state.

When updating an existing key at the same time, omit easing unless changing it is intended. Native upsert and script key updates preserve its ID and unspecified curve metadata; nearby fractional keys remain independent. Read [animation.md](references/animation.md) for exact-time and driven-channel limits. The editor's Set Key keysets are UI controls, not an additional MCP tool.

## Preview, refine and deliver

Inspect actual `render_preview` images at meaningful timestamps: before and after a reveal, peak movement, transitions and the loop boundary as applicable. Check text fit, contrast, occlusion and timing. `evaluate_frame` proves numeric values, not visual quality. Fix visible problems before delivery.

Use explicit `timelineIds` to preview individual animations. For a live state-machine screenshot, omit time/timeline/parameter overrides. When testing a deterministic timestamp in a state-machine scene, specify `timelineIds` so the preview does not reset the machine to its initial state.

After testing, pause playback and disable runtime test ticks if you enabled them. Restore the user's animation isolation with `control_playback({action:'pause',timelineIds:[]})` unless a specific isolated preview is part of the requested handoff.

Call `validate_scene`, address relevant diagnostics, and `save_project`. Report the actual saved path, the animations created or changed, inspected preview times and material export warnings. Do not claim MP4 or audio output from the frame-sequence exporter.
