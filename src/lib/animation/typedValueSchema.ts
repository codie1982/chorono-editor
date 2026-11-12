import type { EasingType } from '../types'

/** JSON representation shared by native AI actions and MCP adapters. Runtime
 * semantics remain in typedValues; these schemas describe its finite scalar,
 * discrete string/boolean, Vec2 and 0..255 RGBA payload families. A target's
 * static value and color-path rules are validated by assertTrackValues. Object
 * extension fields remain transport-compatible with the prior open payload;
 * this schema does not claim that every extension is accepted by the domain. */
export const animatableValueSchema = {
  description: 'Value matching the target property: finite number, discrete string/boolean, {x,y}, or {r,g,b,a} channels 0..255. Color targets accept CSS hex/rgb/hsl strings, supported names and legacy packed RGB.',
  anyOf: [
    { type: 'number' }, { type: 'string' }, { type: 'boolean' },
    { type: 'object', required: ['x', 'y'], properties: {
      x: { type: 'number', description: 'Horizontal vector component in the target coordinate space.' },
      y: { type: 'number', description: 'Vertical vector component in the target coordinate space.' },
    } },
    { type: 'object', required: ['r', 'g', 'b', 'a'],
      properties: Object.fromEntries(['r', 'g', 'b', 'a'].map(channel => [channel,
        { type: 'number', minimum: 0, maximum: 255, description: `${channel.toUpperCase()} channel in 0..255; alpha uses 255 for opaque.` }])) },
  ],
}

export const SIMPLE_EASING_TYPES = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut'] as const satisfies readonly EasingType[]

/** Legacy action easing accepts names only and retains easeInOut as its
 * omitted-value default. Modern handle tools additionally accept an easing
 * object; the curve belongs to the leading key and its following segment. */
export const simpleEasingSchema = {
  type: 'string', enum: [...SIMPLE_EASING_TYPES],
  description: 'Interpolation from this key to the next. Omitted legacy add_keyframes easing defaults to easeInOut.',
}

/** Handle-compatible easing representation. Bezier coordinates are unitless;
 * exact range/curve validation remains with the existing animation commands. */
export const handleEasingSchema = {
  description: 'Leading-key easing name or EasingDefinition object. Handle-based tools default to linear when omitted.',
  anyOf: [
    { type: 'string', enum: [...SIMPLE_EASING_TYPES, 'customBezier'] },
    { type: 'object', required: ['type'], properties: {
      type: { type: 'string', enum: [...SIMPLE_EASING_TYPES, 'customBezier'], description: 'Existing easing family.' },
      bezier: { type: 'object', properties: Object.fromEntries(['cx1', 'cy1', 'cx2', 'cy2'].map(key => [key,
        { type: 'number', description: `Unitless cubic Bezier ${key} control coordinate.` }])) },
    } },
  ],
}

/** A typed key input without stored key identity. Identity allocation and
 * existing-key collision handling belong to the caller's native command. */
export function keyframeInputSchema(easing: Record<string, unknown> = handleEasingSchema): Record<string, unknown> {
  return { type: 'object', required: ['timeMs', 'value'], properties: {
    timeMs: { type: 'number', description: 'Time in the explicit timeline, in milliseconds.' },
    value: animatableValueSchema,
    easing,
  } }
}
