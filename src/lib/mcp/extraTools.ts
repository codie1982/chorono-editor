import { LIMITS, type JsonObject, type ToolDefinition } from './protocol'

/** Build a bridge-only tool definition. Descriptions do not change validation. */
function extra(name: string, description: string, properties: JsonObject = {}, required: string[] = [], readOnly = false): ToolDefinition {
  return { name, description, inputSchema: { type: 'object', properties, required }, annotations: { readOnlyHint: readOnly, openWorldHint: false } }
}

const timeMs = { type: 'number', minimum: 0, description: 'Absolute timeline time in milliseconds. Omit to use the current editor playhead.' }
const timelineIds = {
  type: 'array', items: { type: 'string' },
  description: 'Nonempty list of existing timeline ids to evaluate together, bypassing state machines. Omit to use normal scene evaluation; [] is invalid for rendering/evaluation/export.',
}
const parameters = { type: 'object', description: 'Map of scene parameter ids to values, for this evaluation only; values must match the scene parameter types.' }
const exportName = {
  type: 'string',
  description: 'Output basename, optionally including the output extension. Starts with a letter/digit; at most 100 characters before extension, using letters, digits, dots, underscores or hyphens. No paths or "..". Omit for animation-<timestamp>. Existing files are never overwritten.',
}
const projectName = {
  type: 'string',
  description: 'Project basename, optionally ending in .chorono.json. Starts with a letter/digit; at most 100 characters before extension, using letters, digits, dots, underscores or hyphens. No paths or "..".',
}

/**
 * Metadata for tools implemented by the broker/editor rather than ActionRegistry.
 * The shared bridge parameter adapter is applied by getToolCatalog. Keep defaults,
 * output fields and limitations synchronized with broker.ts, editor.ts and storage.ts.
 */
export const EXTRA_TOOLS: ToolDefinition[] = [
  extra('list_sessions',
    'Find browser tabs explicitly paired with the running local Chorono server. Returns JSON text with sessions: [{id,label,lastSeenAt}]; an empty list means no connected editor. Use an id as sessionId to select a tab. Does not open or connect tabs; unlike get_scene, no paired tab is required.', {}, [], true),
  extra('get_capabilities',
    'Discover supported tools, object kinds/property controls, particle preset ids, limits, exports and the SceneAPI reference. Returns this metadata as JSON text without requiring a running editor. Use get_scene for actual project data; capability discovery does not prove a browser is connected.', {}, [], true),
  extra('get_scene',
    'Read the complete scene, revision, selectedTimelineId and currentTimeMs from a connected editor as JSON text. Use before editing existing data and for full nested fields; list_layers/describe_layer give shorter summaries. Reading does not embed temporary blob media; save_project creates a portable file.', {}, [], true),
  extra('run_script',
    'Build editable layers and animation with synchronous SceneAPI JavaScript in isolated QuickJS, with no Node, DOM, network, imports or filesystem. Failure discards all edits. Returns JSON text with scene summaries, logs and commandCount; a commit also returns revision. dryRun adds planId without editing; use apply_script_plan to commit it. Use batch_actions for native tool calls.', {
      code: { type: 'string', maxLength: LIMITS.scriptBytes, description: 'Synchronous authoring code using the documented scene API in chorono://scripting. Maximum 128 KiB; execution is limited to 2 seconds and a 32 MiB isolated heap.' },
      dryRun: { type: 'boolean', description: 'Default false. If true, prepare a plan valid for five minutes in this session, returning planId and the unchanged revision. Does not apply edits.' },
    }, ['code']),
  extra('apply_script_plan',
    'Commit the exact scene prepared by run_script dryRun, preserving its generated ids without executing code again. Requires the same editor and unchanged scene revision; expired, consumed or foreign plans fail. Successful plans are consumed. Returns JSON text with revision, scene summaries, logs and commandCount; use run_script to prepare a new plan.', {
      planId: { type: 'string', description: 'Unconsumed planId returned by run_script dryRun in this editor session within the last five minutes.' },
    }, ['planId']),
  extra('batch_actions',
    'Apply ordered native scene actions atomically as one undo step. Later actions see earlier changes; any failure discards the batch. Returns JSON text with revision, composition, layer/timeline summaries and addedLayerIds. Supports ActionRegistry mutations only, not scripts, reads, playback or file tools; use run_script for procedural authoring.', {
      actions: {
        type: 'array', minItems: 1, maxItems: 100,
        description: 'One to 100 ordered native mutations; put sessionId, expectedRevision and requestId on the outer batch, not individual actions.',
        items: {
          type: 'object', required: ['name', 'arguments'], additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Native mutation tool name, for example create_object or set_keyframes.' },
            arguments: { type: 'object', description: 'Arguments matching the named tool input schema. References may use ids created earlier in this batch.' },
          },
        },
      },
    }, ['actions']),
  extra('render_preview',
    'Inspect an actual PNG frame from a connected editor without changing the scene. Returns an MCP image plus JSON text with revision, width, height and timeMs. With no time/timelines/parameters, captures the live runtime state. For a timed or parameter-overridden state-machine frame specify timelineIds. Use evaluate_frame for values; it cannot prove visual quality. Oversized previews fail.', {
      timeMs, timelineIds,
      width: { type: 'integer', minimum: 16, maximum: 2048, description: 'Output width in pixels; aspect ratio is preserved. Default min(1280, composition.width). Output is limited to 4,194,304 pixels; source composition to 16,777,216 pixels.' },
      parameters,
    }, [], true),
  extra('control_playback',
    'Play, pause, stop or seek the connected editor viewport and optionally change timeline selection, isolation or speed. Stop pauses and resets the playhead to zero. Does not create keyframes or an undo step. Returns JSON text with revision, action, selectedTimelineId and timeMs. Use render_preview to inspect pixels or get_runtime for live playback state.', {
      action: { type: 'string', enum: ['play', 'pause', 'stop', 'seek'], description: 'Transport operation. seek uses timeMs; with no timeMs it leaves the playhead unchanged.' },
      timeMs,
      timelineId: { type: 'string', description: 'Existing timeline to select in the UI. Omit to retain the current selection; selection alone does not isolate evaluation.' },
      timelineIds: { type: 'array', items: { type: 'string' }, description: 'Existing timelines to isolate in the live viewport. [] restores all timelines and state-machine control; omission retains current isolation.' },
      speed: { type: 'number', minimum: 0.1, maximum: 4, description: 'Live playback multiplier, 1 = normal speed. Omit to keep the current rate; does not change saved keyframe times.' },
    }, ['action']),
  extra('control_runtime',
    'Set live scene parameters or dispatch a state-machine event for interactive testing. Does not save parameter defaults or create an undo step; use edit_entity for authored data. Returns JSON text with revision and requested parameters/event. Unknown parameters or unavailable machines fail. Changes apply sequentially, so an error can leave earlier live parameter changes applied; inspect get_runtime.', {
      parameters: { type: 'object', description: 'Map of existing scene parameter ids to live values. Omit to leave parameters unchanged; this does not change their authored defaults.' },
      event: { type: 'string', description: 'Event name to dispatch. Requires an active state machine and enables runtime test ticks, even while playback is paused. Restore isolation with control_playback timelineIds:[] if needed.' },
      machineId: { type: 'string', description: 'Target active state-machine id for event dispatch. Omit to use normal runtime event routing.' },
      testMode: { type: 'boolean', description: 'Enable/disable runtime test ticks while paused. Omit to retain the current mode; supplying event always enables it, even with testMode:false.' },
    }),
  extra('get_runtime',
    'Inspect live parameters, state-machine states, active timelines and playback state in a connected editor. Returns JSON text including revision, currentTimeMs, isPlaying and selectedTimelineId plus runtime state. Does not change playback. Use get_scene for authored defaults; use control_runtime to test events and live values.', {}, [], true),
  extra('evaluate_frame',
    'Evaluate animation and runtime wiring without drawing pixels or changing the scene. Returns JSON text with revision, values (target-path overrides) and parameters. Omitting time/timelines/parameters reads the live frame. Timed state-machine evaluation requires timelineIds. Use render_preview for visual inspection; evaluate_at_time only evaluates timeline tracks without runtime wiring.', { timeMs, timelineIds, parameters }, [], true),
  extra('undo',
    'Reverse the most recent undoable scene transaction in the connected editor, including manual edits. A script or native batch is one transaction. An empty undo history leaves the scene/revision unchanged. Returns JSON text with revision and scene summaries. Use redo to reapply; this does not remove files written by save_project or exports.'),
  extra('redo',
    'Reapply the most recently undone scene transaction in the connected editor. Requires an earlier undo; a new scene edit clears redo history. Empty redo history leaves the scene/revision unchanged. Returns JSON text with revision and scene summaries. Use undo to reverse again; this does not rerun scripts or file exports.'),
  extra('save_project',
    'Save a portable .chorono.json project from the connected editor, embedding local blob media. Writes under CHORONO_MCP_PROJECT_DIR or <project root>/projects; returns JSON text with path, bytes, sha256 and revision. Existing files fail unless overwrite:true. Media packaging/size failures are reported. Use this for later editing/reopening; export_runtime is a player output, not the source project.', {
      name: { ...projectName, description: `${projectName.description} Omit to derive the basename from composition.id.` },
      overwrite: { type: 'boolean', description: 'Default false. True atomically replaces an existing regular project file; symlinks and non-regular targets are refused.' },
    }),
  extra('list_projects',
    'Find saved .chorono.json files under CHORONO_MCP_PROJECT_DIR or <project root>/projects. Returns JSON text with projects: [{name,bytes,modifiedAt}]; an empty directory returns []. Symlinks/non-regular files are excluded. Requires the local editor server but no paired browser. Use load_project with a returned name; this does not list exports.', {}, [], true),
  extra('load_project',
    'Replace the connected editor scene with a saved .chorono.json file from the configured project directory, as one undoable edit. Returns JSON text with revision and scene summaries. Missing, invalid, oversized or symlinked files fail before applying. Use list_projects to find names and save_project to preserve the current scene first; not for importing SVG or runtime JSON.', { name: projectName }, ['name']),
  extra('export_runtime',
    'Export validated, optimized runtime JSON for Chorono players from the connected scene, embedding local blob media. Writes .runtime.json under the configured project directory/exports. Returns JSON text with path, bytes, sha256, revision and warnings; inspect warnings for conversion loss. Existing filenames fail. Use save_project for editable source, export_svg for a vector frame, or export_sequence for raster frames.', { name: exportName }),
  extra('export_svg',
    'Export one vector SVG frame from the connected scene. Writes .svg under CHORONO_MCP_PROJECT_DIR/exports or <project root>/projects/exports; never overwrites files. Returns JSON text with path, bytes, sha256, revision and warnings. Unsupported layer kinds may be skipped: inspect warnings. Use render_preview for PNG pixels, export_sequence for animation frames, or save_project for the editable source.', {
      name: exportName,
      timeMs: { type: 'number', minimum: 0, description: 'Absolute timeline time in milliseconds for this vector frame. Default 0, independent of the editor playhead.' },
    }),
  extra('export_sequence',
    'Render PNG animation frames into a ZIP from the connected scene, using composition duration/resolution. Writes .zip in the configured project directory/exports without overwriting. Returns JSON text with path, bytes, sha256, revision and warnings. Limited to 300 frames, 4,194,304 pixels/frame and a 24 MiB ZIP; exceeding limits fails. No audio or MP4 encoding. Use render_preview for one frame or save_project for editable source.', {
      name: exportName,
      fps: { type: 'number', minimum: 1, maximum: 60, description: 'Frames per second; defaults to composition.frameRate. Reduce duration, resolution or FPS if export limits are exceeded.' },
      timelineIds,
    }),
  extra('import_asset',
    'Import supplied base64 file bytes through the editor import pipeline as one undoable scene edit. Returns JSON text with revision, scene summaries and addedLayerIds; parser/validation errors do not commit. No arbitrary local path or server-side URL fetch is accepted. Use list_assets to reuse existing assets; load_project restores a saved Chorono project.', {
      name: { type: 'string', description: 'Source filename including extension, for example logo.png. Used by the import pipeline; not a local filesystem path.' },
      mimeType: { type: 'string', description: 'MIME type matching the supplied bytes, for example image/png or image/svg+xml.' },
      data: { type: 'string', maxLength: 16 * 1024 * 1024, description: 'Raw base64-encoded file bytes, without a data: URL prefix. Maximum 16 MiB of encoded text; supported formats follow the editor import pipeline.' },
    }, ['name', 'mimeType', 'data']),
  extra('validate_scene',
    'Check the connected scene structure and runtime-export compatibility without changing the scene or writing files. Returns JSON text with revision, valid and warnings or errors; structural validation failures return a tool error. Use before export_runtime; validation does not inspect rendered appearance, so use render_preview for visual quality.', {}, [], true),
]
