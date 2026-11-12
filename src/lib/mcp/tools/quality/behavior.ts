import type { ToolDefinition } from '../../protocol'

const READERS = new Set(['list_layers', 'list_assets', 'describe_layer', 'describe_timeline', 'get_scene_json',
  'evaluate_at_time', 'list_timelines', 'list_sessions', 'get_capabilities', 'get_scene', 'render_preview',
  'evaluate_frame', 'get_runtime', 'get_audio_state', 'validate_scene'])
const APPEND_ONLY = new Set(['add_layer', 'create_object', 'create_timeline', 'clone_timeline', 'add_particle_emitter',
  'create_state_machine', 'add_sm_state', 'add_sm_transition', 'add_parameter', 'add_trigger', 'add_binding',
  'add_parameter_wire', 'clone_layer', 'array_layer', 'add_path', 'add_spline', 'add_audio_clip', 'add_modifier', 'import_asset'])
const NEW_FILES = new Set(['render_audio_preview', 'export_audio', 'export_runtime', 'export_svg', 'export_sequence'])
const REMOTE_ASSETS = new Set(['render_preview', 'export_sequence', 'render_audio_preview', 'export_audio', 'normalize_audio_clip'])

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
    || implementationName === 'list_projects'
  const transport = implementationName === 'control_playback' || implementationName === 'control_runtime'
  return {
    ...original,
    readOnlyHint: readOnly,
    destructiveHint: !readOnly && !localNonDestructive && !transport,
    idempotentHint: readOnly || implementationName === 'list_projects',
    openWorldHint: REMOTE_ASSETS.has(implementationName) || (!readOnly && !localNonDestructive && !transport
      && !['save_project', 'load_project', 'run_script', 'batch_actions', 'apply_script_plan', 'undo', 'redo',
        'clear_scene', 'update_composition', 'update_layer', 'delete_layer', 'patch_object', 'update_timeline',
        'delete_timeline', 'add_keyframes', 'set_keyframes', 'update_track', 'remove_track', 'add_modifier',
        'bake_track', 'configure_particles', 'set_initial_state', 'set_interactive', 'edit_entity',
        'group_layers', 'ungroup_layer', 'assign_motion_path', 'trim_path', 'set_audio_master', 'set_audio_gain',
        'set_audio_fades', 'move_audio_clip', 'trim_audio_clip', 'split_audio_clip', 'patch_audio_clip'].includes(implementationName)),
  }
}
