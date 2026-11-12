import { modifierRegistry } from '../../animation/modifiers/ModifierRegistry'
import '../../animation/modifiers/builtins'

/** Discover modifier payload fields from actual registered plugins/defaults.
 * Only known top-level field meanings are described here; parameter names and
 * default scalar types come from each plugin. Extra keys remain allowed because
 * plugins deliberately ignore unknown parameters and extensions may add fields.
 * Scalar-only and target compatibility checks remain with animation validation. */
export function modifierSchema(): Record<string, unknown> {
  const plugins = modifierRegistry.getAll()
  const properties: Record<string, unknown> = {}
  for (const plugin of plugins) for (const [key, value] of Object.entries(plugin.defaultParameters())) {
    properties[key] ??= { description: `Modifier parameter ${key}; default for ${plugin.type} is ${JSON.stringify(value)}. Its unit/meaning is modifier-specific; consult the scripting modifier reference.` }
  }
  return { type: 'object', description: 'Partial CurveModifier. Affects scalar numeric tracks only; defaults are enabled=true, blendMode=add, weight=1 and a fresh id. This appends a modifier; update_track replaces a whole stack.', properties: {
    type: { type: 'string', description: `Registered modifier kind: ${plugins.map(plugin => plugin.type).join(', ')}. Unrecognized legacy kinds retain their prior no-op behavior.` },
    id: { type: 'string', description: 'Optional stable modifier id; a fresh id is allocated when omitted.' },
    enabled: { type: 'boolean', description: 'Whether this modifier participates in evaluation; defaults true.' },
    weight: { type: 'number', description: 'Unitless blend amount, normally 0..1; values above 1 amplify.' },
    blendMode: { type: 'string', description: 'add, multiply, replace or blend. Defaults add; existing backend semantics remain unchanged.' },
    parameters: { type: 'object', description: 'Modifier-specific scalar parameter map. Omitted known values use plugin defaults. Unknown keys are ignored by the plugin, not source path edits.', properties },
  } }
}
