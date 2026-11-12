import { keyframeInputSchema } from '../../animation/typedValueSchema'
import { DEFAULT_NOISE_PARAMS, DEFAULT_WAVEFORM_PARAMS } from '../../animation/controllers/types'
import { modifierSchema } from './modifierSchema'

/** Partial Track representation for the legacy shallow track setter. Named
 * fields replace in full, including arrays/controllers. Unknown extensions and
 * previously accepted payload values remain open; this documents source fields
 * without creating a second numerical/controller validator. Defaults for
 * procedural parameter hints come from the controller domain itself. */
export function trackPatchSchema(): Record<string, unknown> {
  return { type: 'object', description: 'Partial Track source data. Provided fields replace whole existing fields; keyframes replaces the entire key array, while set_keyframes upserts individual keys. Read the current track to preserve ids/easing/tangents/segment modifiers. Controller/modifier/bake support is scalar numeric only.', properties: {
    keyframes: { type: 'array', description: 'Complete replacement key array. Preserve stored key ids and optional tangent/segment metadata from the current track.', items: keyframeInputSchema() },
    controller: { description: 'Complete TrackController replacement, or legacy clearing value. type=keyframe uses keys; waveform and noise are continuously evaluated instead.', properties: {
      type: { description: 'keyframe, waveform or noise.' },
      waveform: parameterHints(DEFAULT_WAVEFORM_PARAMS, 'Frequency is Hz; phase is radians, time is timeline ms. Amplitude/offset use target units.'),
      noise: parameterHints(DEFAULT_NOISE_PARAMS, 'Deterministic seeded noise; frequency is Hz. Strength/offset use target units, octaves are count.'),
    } },
    modifiers: { description: 'Complete replacement CurveModifier stack; use add_modifier to append one modifier.', items: modifierSchema() },
    label: { description: 'Display label for this track.' },
    outOfRange: { description: 'Complete before/after out-of-range policy object from the current Track contract.' },
    easeCurve: { description: 'Cubic Bezier timing tuple [cx1,cy1,cx2,cy2], unitless; replaces the track timing curve.' },
    timeWarp: { description: 'Secondary cubic Bezier timing tuple composed after easeCurve.' },
    multiplierCurve: { description: 'Cubic Bezier multiplier tuple; scalar numeric tracks only.' },
    multiplierAmplitude: { description: 'Unitless influence of multiplierCurve; default 1, zero disables its contribution.' },
  } }
}

/** Expose authoritative default parameter names without making UI/default
 * values into artificial transport limits or defaults that mutate a patch. */
function parameterHints(defaults: object, description: string): Record<string, unknown> {
  return { description, properties: Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key,
    { description: `${key}; source controller default ${JSON.stringify(value)}. Supply the controller data required by its type.` }])) }
}
