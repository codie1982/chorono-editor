import { RIG_WRITE_NAMES, RIG_DIAGNOSTICS } from '../../rig2d/tools'
import type { ToolDefinition } from '../../protocol'

const READERS = new Set([RIG_DIAGNOSTICS.name, 'list_layers', 'list_assets', 'describe_layer', 'describe_timeline', 'get_scene_json',
  'evaluate_at_time', 'list_timelines', 'list_sessions', 'get_capabilities', 'get_scene', 'render_preview',
  'discard_spline_edit', 'evaluate_frame', 'get_runtime', 'get_audio_state', 'validate_scene', 'get_bake_job', 'preview_bake_job',
  'inspect_physics_bake'])
const APPEND_ONLY = new Set(['add_layer', 'create_object', 'create_timeline', 'clone_timeline', 'add_particle_emitter',
  'create_state_machine', 'add_sm_state', 'add_sm_transition', 'add_parameter', 'add_trigger', 'add_binding',
  'add_parameter_wire', 'clone_layer', 'array_layer', 'add_path', 'add_spline', 'add_audio_clip', 'add_modifier', 'import_asset'])
const NEW_FILES = new Set(['render_audio_preview', 'export_audio', 'export_runtime', 'export_svg', 'export_sequence', 'render_2d'])
const REMOTE_ASSETS = new Set(['render_preview', 'export_sequence', 'render_2d', 'render_audio_preview', 'export_audio', 'normalize_audio_clip', 'prepare_spline_edit'])
const RUNTIME_JOB_CONTROLS = new Set(['prepare_rigid_body_bake', 'prepare_voronoi_fracture_bake', 'cancel_bake_job', 'discard_bake_job'])

/** Conservative behavioral hints for the actual implementation, not the public
 * spelling. Unknown mutators/scripts/batches do not claim idempotency or safety.
 * A reversible source edit can still overwrite/remove data: undo support is not
 * a reason to mark destructiveHint=false. Reads may evaluate cached state.
 *
 * Artifacts are real local-file writes, even when source remains unchanged.
 * list_projects may initialize its configured directory, an idempotent write.
 * Rendering/audio may load already-authored remote assets; portable conversion
 * reads blob: media only and preserves remote references without downloading.
 */
export function toolBehavior(implementationName: string, original?: ToolDefinition['annotations']): NonNullable<ToolDefinition['annotations']> {
  const readOnly = READERS.has(implementationName)
  const localNonDestructive = NEW_FILES.has(implementationName) || APPEND_ONLY.has(implementationName)
    || RUNTIME_JOB_CONTROLS.has(implementationName) || implementationName === 'list_projects' || implementationName === 'prepare_spline_edit'
  const transport = implementationName === 'control_playback' || implementationName === 'control_runtime'
  return {
    ...original,
    readOnlyHint: readOnly,
    destructiveHint: !readOnly && !localNonDestructive && !transport,
    idempotentHint: readOnly || implementationName === 'list_projects',
    openWorldHint: REMOTE_ASSETS.has(implementationName) || (!readOnly && !localNonDestructive && !transport
      && !RIG_WRITE_NAMES.has(implementationName) && !['save_project', 'load_project', 'run_script', 'batch_actions', 'apply_script_plan', 'prepare_spline_edit', 'apply_spline_edit', 'discard_spline_edit', 'undo', 'redo',
        'resolve_spline_boolean', 'transform_mesh2d_vertices', 'convert_layer_to_spline', 'edit_mesh2d_topology', 'edit_2d_modifier_stack', 'clear_scene', 'update_composition', 'update_layer', 'delete_layer', 'patch_object', 'update_model3d', 'update_timeline',
        'delete_timeline', 'add_keyframes', 'set_keyframes', 'update_track', 'remove_track', 'add_modifier',
        'bake_track', 'configure_particles', 'set_initial_state', 'set_interactive', 'edit_entity',
        'bake_rigid_bodies', 'bake_voronoi_fracture', 'commit_bake_job', 'clear_physics_bake',
        'group_layers', 'ungroup_layer', 'assign_motion_path', 'trim_path', 'set_audio_master', 'set_audio_gain',
        'set_audio_fades', 'move_audio_clip', 'trim_audio_clip', 'split_audio_clip', 'patch_audio_clip'].includes(implementationName)),
  }
}
