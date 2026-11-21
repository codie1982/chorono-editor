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
const rigidMaterial = {
  type: 'object', additionalProperties: false,
  description: 'Optional physical material. Omitted fields use density 1, friction 0.2, restitution 0.2 and airFriction 0.01.',
  properties: {
    densityKgPerSquareMeter: { type: 'number', exclusiveMinimum: 0, description: 'Positive mass per square metre before conversion to solver units.' },
    friction: { type: 'number', minimum: 0, maximum: 1, description: 'Surface friction from 0 to 1.' },
    restitution: { type: 'number', minimum: 0, maximum: 1, description: 'Bounce coefficient from 0 to 1.' },
    airFriction: { type: 'number', minimum: 0, exclusiveMaximum: 1, description: 'Per-step air damping in [0,1).' },
  },
}
const rigidVelocity = {
  type: 'object', additionalProperties: false,
  description: 'Initial composition-pixel velocity; omitted axes default to zero.',
  properties: {
    x: { type: 'number', description: 'Horizontal pixels per second, positive right.' },
    y: { type: 'number', description: 'Vertical pixels per second, positive down.' },
  },
}
const gravity = {
  type: 'object', additionalProperties: false,
  description: 'Gravity in metres per second squared; defaults to {x:0,y:9.81}.',
  properties: {
    x: { type: 'number', description: 'Horizontal gravity, positive right.' },
    y: { type: 'number', description: 'Vertical gravity, positive down.' },
  },
}
const rigidBakeProperties = {
  timelineId: { type: 'string', description: 'Existing target timeline id; its transform targets must not already be animated or driven.' },
  startTimeMs: { type: 'number', minimum: 0, description: 'Bake start in target-timeline milliseconds; defaults to zero.' },
  durationMs: { type: 'number', exclusiveMinimum: 0, maximum: 120000, description: 'Positive simulation duration in milliseconds within the target timeline.' },
  stepHz: { type: 'number', minimum: 1, maximum: 240, description: 'Fixed solver ticks per second; defaults to 120.' },
  sampleFps: { type: 'number', minimum: 1, maximum: 120, description: 'Editable output key samples per second; defaults to 30 and must align with stepHz.' },
  pixelsPerMeter: { type: 'number', exclusiveMinimum: 0, maximum: 10000, description: 'Composition pixels per physics metre; defaults to 100.' },
  gravity,
  bodies: {
    type: 'array', minItems: 1, maxItems: 128,
    description: 'Unique supported rectangle layers; at least one must be dynamic.',
    items: { type: 'object', additionalProperties: false, required: ['layerId', 'motionType'], properties: {
      layerId: { type: 'string', description: 'Root, non-instanced rectangle shape layer id.' },
      motionType: { type: 'string', enum: ['dynamic', 'static'], description: 'dynamic receives tracks; static acts only as a collider.' },
      material: rigidMaterial,
      initialVelocityPxPerSecond: rigidVelocity,
      initialAngularVelocityDegPerSecond: { type: 'number', description: 'Initial clockwise degrees per second; defaults to zero.' },
    } },
  },
  recordId: { type: 'string', minLength: 1, maxLength: 256, description: 'Optional unique persisted ownership id; omit for a deterministic recipe-derived id.' },
  replaceRecordId: { type: 'string', minLength: 1, maxLength: 256, description: 'Existing rigid bake record to replace. Its owned output is removed only at commit; cannot be combined with recordId.' },
  replaceEdited: { type: 'boolean', description: 'Direct bake only: true explicitly permits replacing edited/legacy owned output. Default false refuses hash conflicts. Persistent jobs choose this on commit_bake_job.' },
}
const voronoiBakeProperties = {
  sourceLayerId: { type: 'string', description: 'Root sharp rectangle shape with solid fill, or root image rectangle with persisted image dimensions; becomes the dynamic fracture source.' },
  staticLayerIds: { type: 'array', maxItems: 127, uniqueItems: true, items: { type: 'string' }, description: 'Optional root rectangle colliders such as floor and walls.' },
  timelineId: { type: 'string', description: 'Existing target timeline id with no colliding source/fragment transform or visibility tracks.' },
  startTimeMs: { type: 'number', minimum: 0, description: 'Bake start in target-timeline milliseconds; defaults to zero.' },
  durationMs: { type: 'number', exclusiveMinimum: 0, maximum: 120000, description: 'Positive simulation duration in milliseconds within the target timeline.' },
  fractureTimeMs: { type: 'number', exclusiveMinimum: 0, description: 'Simulation-local fracture time aligned to an interior fixed-step tick. Required for the default/time trigger; omit for impact.' },
  fractureTrigger: {
    type: 'object', additionalProperties: false,
    description: 'Optional trigger policy. Omit or use kind=time with fractureTimeMs. Impact uses the first qualifying pre-solve contact and requires selected static colliders.',
    required: ['kind'],
    properties: {
      kind: { type: 'string', enum: ['time', 'impact'] },
      minimumRelativeNormalSpeedPxPerSecond: { type: 'number', exclusiveMinimum: 0, description: 'Required for impact: minimum contact-point closing speed in composition pixels/s.' },
      colliderLayerIds: { type: 'array', minItems: 1, maxItems: 127, uniqueItems: true, items: { type: 'string' }, description: 'Impact-only subset of staticLayerIds. Omit to use every selected static collider.' },
    },
  },
  explosion: {
    type: 'object', additionalProperties: false,
    description: 'Optional artistic external energy applied once at fracture; this is separate from physical impact energy.',
    required: ['centerLocalOffsetPx', 'radialVelocityPxPerSecond', 'directionDeg', 'directionalVelocityPxPerSecond', 'spinVelocityDegPerSecond', 'variation', 'seed'],
    properties: {
      centerLocalOffsetPx: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: {
        x: { type: 'number', description: 'Source-local horizontal offset from the source centre of mass.' },
        y: { type: 'number', description: 'Source-local vertical offset from the source centre of mass.' },
      } },
      radialVelocityPxPerSecond: { type: 'number', minimum: 0 },
      directionDeg: { type: 'number', description: 'Composition-space clockwise direction; 0 right, 90 down.' },
      directionalVelocityPxPerSecond: { type: 'number', minimum: 0 },
      spinVelocityDegPerSecond: { type: 'number', minimum: 0 },
      variation: { type: 'number', minimum: 0, maximum: 1, description: 'Seeded per-fragment multiplier range around one.' },
      seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
    },
  },
  fragmentCount: { type: 'integer', minimum: 2, maximum: 100, description: 'Requested Voronoi fragment count; all cells are retained or generation fails.' },
  seed: { type: 'integer', minimum: 0, maximum: 4294967295, description: 'Unsigned deterministic random seed.' },
  generationId: { type: 'string', minLength: 1, maxLength: 116, pattern: '^[A-Za-z0-9_-]+$', description: 'Unique stable ASCII topology prefix. Generated fragment layer ids append -fragment-N and remain valid portable scene ids.' },
  recordId: { type: 'string', minLength: 1, maxLength: 256, description: 'Optional unique persisted bake ownership id.' },
  replaceRecordId: { type: 'string', minLength: 1, maxLength: 256, description: 'Existing fracture bake record to replace atomically. Its generated layers/topology remain until commit; cannot combine with recordId.' },
  replaceEdited: { type: 'boolean', description: 'Direct bake only: true explicitly permits replacing edited/legacy owned output. Default false refuses hash conflicts. Persistent jobs choose this on commit_bake_job.' },
  stepHz: { type: 'number', minimum: 1, maximum: 240, description: 'Fixed solver ticks per second; defaults to 120.' },
  sampleFps: { type: 'number', minimum: 1, maximum: 120, description: 'Editable output key samples per second; defaults to 30 and must align with stepHz.' },
  pixelsPerMeter: { type: 'number', exclusiveMinimum: 0, maximum: 10000, description: 'Composition pixels per physics metre; defaults to 100.' },
  gravity,
  material: rigidMaterial,
  initialVelocityPxPerSecond: rigidVelocity,
  initialAngularVelocityDegPerSecond: { type: 'number', description: 'Source initial clockwise degrees per second; defaults to zero.' },
}
const bakeJobId = {
  type: 'string', pattern: '^bake-[A-Za-z0-9_-]{8,120}$',
  description: 'Opaque persistent id returned by a prepare_*_bake call in this MCP client/editor session.',
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
    'Discover supported tools, object kinds/property controls, particle preset ids, limits, exports and the SceneAPI reference. Returns this metadata as JSON text without requiring a running editor. Use get_scene for actual project data; capability discovery does not prove a browser is connected. summary:true omits large schemas; toolName returns one exact callable schema and batch support.', {
      summary: { type: 'boolean', description: 'Lightweight discovery without full schemas/property groups/script help. Cannot combine true with toolName.' },
      toolName: { type: 'string', description: 'Exact canonical or historical tool name to inspect; no editor operation runs.' },
    }, [], true),
  extra('get_handoff_context',
    'Read the selected focus captured by Send to Agent together with the current complete scene and revision. The handoff is tab-local, expires after ten minutes, and fails if the document or selected target changed. This read does not issue a source-edit readToken; call get_scene before every mutation. Inspect render_preview PNGs and validate_scene to verify results.', {
      handoffId: { type: 'string', minLength: 1, maxLength: 100, description: 'Opaque ID copied by the Send to Agent menu in this editor tab.' },
    }, ['handoffId'], true),
  extra('get_scene',
    'Read the complete scene, revision, selectedTimelineId and currentTimeMs from a connected editor as JSON text. Use before editing existing data and for full nested fields; list_layers/describe_layer give shorter summaries. Returns a one-use readToken for source edits at this revision in this connection, valid five minutes. Reading does not embed temporary blob media; save_project creates a portable file.', {}, [], true),
  extra('run_script',
    'Build editable layers and animation with synchronous SceneAPI JavaScript in isolated QuickJS, with no Node, DOM, network, imports or filesystem. Failure discards all edits. Returns JSON text with scene summaries, logs and commandCount; a commit also returns revision. dryRun adds planId and a new plan-bound readToken/revision without editing; use apply_script_plan to commit it. Use batch_actions for native tool calls.', {
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
        description: 'One to 100 ordered native mutations; put sessionId, expectedRevision, readToken and requestId on the outer batch, not individual actions.',
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
  extra('render_audio_preview', 'Render an actual stereo WAV preview (up to 10 seconds) through the shared audio mixer. Saves a playable WAV and returns measured peak/RMS/clipping. PNG/evaluate_frame cannot verify audio. Specify timelineIds for state-machine scenes.', { name: exportName, startMs: { type: 'number', minimum: 0, description: 'Mix start time in milliseconds; defaults to zero.' }, durationMs: { type: 'number', exclusiveMinimum: 0, maximum: 10000, description: 'Preview duration in milliseconds; defaults to remaining composition duration capped at 10000.' }, timelineIds, sampleRate: { type: 'integer', enum: [44100, 48000], description: 'Output sample rate in Hz: 44100 or 48000.' } }, [], true),
  extra('export_audio', 'Mix the selected timeline audio to an actual stereo PCM WAV (up to 120 seconds, 24 MB). Applies gain automation, fades, pan and saved master gain. Specify timelineIds for state-machine scenes.', { name: exportName, startMs: { type: 'number', minimum: 0, description: 'Mix start time in milliseconds; defaults to zero.' }, durationMs: { type: 'number', exclusiveMinimum: 0, maximum: 120000, description: 'Export duration in milliseconds; defaults to remaining composition duration capped at 120000.' }, timelineIds, sampleRate: { type: 'integer', enum: [44100, 48000], description: 'Output sample rate in Hz: 44100 or 48000.' } }),
  extra('get_audio_state', 'Read live audio transport, decoded source status, effective source/gain/pan/rate and master meters. Does not mutate playback.', {}, [], true),
  extra('normalize_audio_clip', 'Measure the trimmed source peak and set clip gain to the requested peak dBFS (default -1). Returns actual normalization gain; automation must be removed first.', { layerId: { type: 'string', description: 'Existing audio clip layer id to normalize.' }, targetDbFS: { type: 'number', minimum: -24, maximum: 0, description: 'Target peak in dBFS, from -24 to 0; defaults to -1.' } }, ['layerId']),
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
    'Export validated, optimized runtime JSON for Chorono players from the connected scene, embedding local blob media. The player payload preserves visual layers/visibility, assets, timelines, parameters, wires, state machines and initial state; editor guides, authoring provenance and physics ownership recipes are omitted because committed physics already plays through ordinary tracks. Writes .runtime.json under the configured project directory/exports. Returns JSON text with path, bytes, sha256, revision and warnings; inspect warnings for conversion loss. Existing filenames fail. Use save_project for editable source, export_svg for a vector frame, or export_sequence for raster frames.', { name: exportName }),
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
  extra('bake_rigid_bodies',
    'Run the deterministic Matter.js fixed-step solver for supported root rectangle layers and publish ordinary transform tracks plus a versioned rigid-bake ownership record as one undoable scene transaction. Dense solver samples and runtime objects are not stored in scene JSON. Prefer prepare_rigid_body_bake plus status/preview/commit when the result must be reviewed or cancelled.',
    rigidBakeProperties, ['timelineId', 'durationMs', 'bodies']),
  extra('bake_voronoi_fracture',
    'Generate one deterministic Voronoi fracture for a supported root rectangle, trigger it by fixed time or qualifying impact, optionally add one-shot artistic explosion energy, and atomically publish editable tracks plus topology/bake provenance. Sharp solid shapes publish path fragments; image rectangles publish textured Mesh2D fragments with full-source UVs. Prefer prepare_voronoi_fracture_bake for review or cancellation.',
    voronoiBakeProperties, ['sourceLayerId', 'timelineId', 'durationMs', 'fragmentCount', 'seed', 'generationId']),
  extra('prepare_rigid_body_bake',
    'Start a persistent rigid-body Worker preview without changing scene JSON or undo history. Requires a fresh get_scene revision/readToken to bind the prepared source. Returns immediately with bakeJob.jobId; poll get_bake_job, inspect preview_bake_job, then commit_bake_job with a new source read, or cancel/discard it.',
    rigidBakeProperties, ['timelineId', 'durationMs', 'bodies']),
  extra('prepare_voronoi_fracture_bake',
    'Start a persistent deterministic Voronoi/rigid Worker preview for a supported sharp solid shape or image rectangle. Time and impact triggers plus optional one-shot artistic explosion are retained in the reviewed result. No fragments or tracks are created before commit. Requires a fresh get_scene revision/readToken.',
    voronoiBakeProperties, ['sourceLayerId', 'timelineId', 'durationMs', 'fragmentCount', 'seed', 'generationId']),
  extra('get_bake_job',
    'Read one persistent bake job status, monotonic progress, retained report and source-stale diagnostics. The job belongs to the MCP client/editor session that prepared it. This does not change scene source or playback.',
    { jobId: bakeJobId }, ['jobId'], true),
  extra('preview_bake_job',
    'Sample one ready dense physics preview at local simulation time without changing scene source, playback or undo history. Returns body poses, visibility and collider geometry; use commit_bake_job only after reviewing it.', {
      jobId: bakeJobId,
      timeMs: { type: 'number', minimum: 0, description: 'Simulation-local preview time in milliseconds; clamped to the prepared duration. Omit to use the fracture event or a representative early frame.' },
    }, ['jobId'], true),
  extra('cancel_bake_job',
    'Request cooperative cancellation for a queued/running persistent bake. It never removes committed scene data. Status remains queryable until discard_bake_job releases the record.',
    { jobId: bakeJobId }, ['jobId']),
  extra('discard_bake_job',
    'Release a persistent bake job and any unpublished dense preview buffers. This does not undo a completed scene commit and the job id becomes invalid.',
    { jobId: bakeJobId }, ['jobId']),
  extra('inspect_physics_bake',
    'Inspect one committed rigid/fracture bake without mutation. Reports current/edited/incomplete/legacy ownership, source state and exact hash/identity issues. Fracture records also report the atomic topology event and exact-event visible-boundary versus compiled-collider quality. Read this before Clear or Re-bake.',
    { recordId: { type: 'string', minLength: 1, maxLength: 256, description: 'Persisted rigid bake record id from get_scene.' } }, ['recordId'], true),
  extra('clear_physics_bake',
    'Remove only the tracks, fragment layers, topology and timeline memberships owned by one committed bake as one undoable edit. Default refuses edited, incomplete or legacy output. Set discardEdited:true only after explicitly deciding to delete those edits; ambiguous duplicate targets still refuse.', {
      recordId: { type: 'string', minLength: 1, maxLength: 256, description: 'Persisted rigid bake record id to clear.' },
      discardEdited: { type: 'boolean', description: 'Default false. True explicitly deletes remaining edited/legacy bake-owned output; duplicate target/layer ids still refuse.' },
    }, ['recordId']),
  extra('commit_bake_job',
    'Publish one ready, reviewed bake preview as ordinary editable tracks and provenance in a single undoable source edit. A replacement defaults to preserving edited output and refuses hash conflicts; set replaceEdited:true only for an explicit destructive Replace choice. Read get_scene immediately before commit and pass its expectedRevision/readToken.',
    { jobId: bakeJobId, replaceEdited: { type: 'boolean', description: 'Default false. True explicitly replaces edited/legacy output for a job prepared with replaceRecordId.' } }, ['jobId']),
  extra('render_2d',
    'Render one PNG still or a complete 2D video source from the connected scene. auto prefers a running Chorono Render service and transfers frames there for final PNG/MP4 output; when unavailable it falls back to a local PNG or PNG-sequence ZIP written under the configured exports directory. This does not mutate the editable scene.', {
      name: { ...exportName, description: 'Optional local output basename and Chorono Render title. No path components; existing local files are never overwritten.' },
      intent: { type: 'string', enum: ['still', 'video'], description: 'still renders one frame at timeMs; video samples the complete composition duration.' },
      backend: { type: 'string', enum: ['auto', 'chorono', 'builtin'], description: 'auto (default) prefers Chorono Render and falls back to the built-in renderer. chorono refuses when the service is unavailable; builtin never contacts it.' },
      timeMs: { type: 'number', minimum: 0, description: 'Still-frame composition time in milliseconds; defaults to the current editor playhead. Ignored for video.' },
      fps: { type: 'number', minimum: 1, maximum: 60, description: 'Sampling frame rate; defaults to composition.frameRate. Used for video and recorded with transferred stills.' },
      scale: { type: 'number', minimum: 1, maximum: 4, description: 'Integer-like output resolution multiplier from 1 to 4; dimensions and memory limits still apply.' },
      background: { type: 'string', enum: ['scene', 'transparent'], description: 'Use the saved scene background or preserve PNG alpha. MP4 finishing composites transparent pixels on black.' },
      timelineIds,
    }, ['intent']),
  extra('import_asset',
    'Import supplied base64 file bytes through the editor import pipeline as one undoable scene edit. Returns JSON text with revision, scene summaries and addedLayerIds; parser/validation errors do not commit. No arbitrary local path or server-side URL fetch is accepted. Use list_assets to reuse existing assets; load_project restores a saved Chorono project.', {
      name: { type: 'string', description: 'Source filename including extension, for example logo.png. Used by the import pipeline; not a local filesystem path.' },
      timelineId: { type: 'string', description: 'For audio placement, target timeline id; defaults to the selected timeline.' },
      startMs: { type: 'number', minimum: 0, description: 'For audio placement, start time in milliseconds; defaults to the current playhead.' },
      mimeType: { type: 'string', description: 'MIME type matching the supplied bytes, for example image/png or image/svg+xml.' },
      data: { type: 'string', maxLength: 16 * 1024 * 1024, description: 'Raw base64-encoded file bytes, without a data: URL prefix. Maximum 16 MiB of encoded text; supported formats follow the editor import pipeline.' },
    }, ['name', 'mimeType', 'data']),
  extra('validate_scene',
    'Check the connected scene structure and runtime-export compatibility without changing the scene or writing files. Returns JSON text with revision, valid and warnings or errors; structural validation failures return a tool error. Use before export_runtime; validation does not inspect rendered appearance, so use render_preview for visual quality.', {}, [], true),
]
