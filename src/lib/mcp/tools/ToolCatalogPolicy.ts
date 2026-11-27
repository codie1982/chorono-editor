import { RIG_WRITE_NAMES, RIG_DIAGNOSTICS } from '../rig2d/tools'

/** Published discovery profiles. Standard is the focused authoring surface;
 * legacy preserves the pre-1.1 names in tools/list for existing integrations.
 * Both profiles accept every historical call through the same validation path. */
export type ToolCatalogProfile = 'standard' | 'legacy'

/** Transport-only aliases preserve the implementation's exact argument/output
 * contract. They do not rename SceneAPI methods or internal ActionRegistry IDs.
 * In particular replace_layer_fields retains shallow nested replacement. */
export const TOOL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  create_layer: 'create_object',
  get_layer: 'describe_layer',
  get_timeline: 'describe_timeline',
  upsert_keyframes: 'set_keyframes',
  replace_layer_fields: 'patch_object',
  evaluate_timeline_values: 'evaluate_at_time',
  create_state_machine_state: 'add_sm_state',
  create_state_machine_transition: 'add_sm_transition',
  set_state_machine_initial_state: 'set_initial_state',
})

/** Earned top-level workflows, rather than every low-level variation. Advanced
 * native mutations can be schema-discovered and invoked inside batch_actions;
 * clients needing every historical tool directly select the legacy profile. */
export const STANDARD_TOOL_NAMES: readonly string[] = Object.freeze([
  ...Array.from(RIG_WRITE_NAMES), RIG_DIAGNOSTICS.name,
  'list_sessions', 'get_capabilities', 'get_handoff_context', 'get_scene', 'list_layers', 'get_layer',
  'list_timelines', 'get_timeline', 'list_assets', 'create_layer', 'update_layer',
  'resolve_spline_boolean', 'transform_mesh2d_vertices', 'convert_layer_to_spline', 'edit_mesh2d_topology', 'edit_2d_modifier_stack',
  'convert_layer_to_mesh2d', 'split_mesh2d_edge', 'apply_mesh2d_subdivision',
  'create_mesh2d_from_source', 'regenerate_mesh2d', 'set_mesh2d_texture',
  'set_mesh2d_pins', 'set_mesh2d_deformation',
  'bake_rigid_bodies', 'bake_voronoi_fracture',
  'prepare_rigid_body_bake', 'prepare_voronoi_fracture_bake', 'get_bake_job',
  'preview_bake_job', 'cancel_bake_job', 'discard_bake_job', 'commit_bake_job',
  'inspect_physics_bake', 'clear_physics_bake',
  'upsert_keyframes', 'create_timeline', 'update_timeline', 'clone_layer',
  'array_layer', 'group_layers', 'ungroup_layer', 'delete_layer', 'run_script',
  'apply_script_plan', 'prepare_spline_edit', 'apply_spline_edit', 'discard_spline_edit', 'batch_actions', 'render_preview', 'evaluate_frame',
  'get_runtime', 'control_playback', 'control_runtime', 'validate_scene',
  'save_project', 'load_project', 'list_projects', 'import_asset', 'export_runtime',
  'export_svg', 'export_sequence', 'render_2d', 'export_audio', 'render_audio_preview',
  'get_audio_state', 'undo', 'redo', 'update_composition', 'update_model3d',
])

/** Resolve only explicit own aliases. Unknown names remain unchanged so the
 * authoritative callable catalog can reject them (including prototype names). */
export function implementationToolName(name: string): string {
  return Object.prototype.hasOwnProperty.call(TOOL_ALIASES, name) ? TOOL_ALIASES[name] : name
}

/** Return the preferred transport name without changing legacy call semantics. */
export function canonicalToolName(implementationName: string): string {
  return Object.keys(TOOL_ALIASES).find(name => TOOL_ALIASES[name] === implementationName) ?? implementationName
}

/** Strict startup configuration: a misspelled profile must not silently change
 * which tools an integration discovers. Missing/empty value selects standard. */
export function parseToolCatalogProfile(value?: string): ToolCatalogProfile {
  if (!value) return 'standard'
  if (value === 'standard' || value === 'legacy') return value
  throw new Error('CHORONO_MCP_TOOL_PROFILE must be standard or legacy')
}
