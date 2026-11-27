type Schema = Record<string, unknown>
const num = { type: 'number' }, opacity = { type: 'number', minimum: 0, maximum: 100, description: 'Paint opacity percent (0–100); layer opacity is separately 0–1.' }
const imagePaint = { type: 'object', additionalProperties: false, properties: { version: { const: 1 }, assetId: { type: 'string' }, fit: { enum: ['cover', 'contain', 'fill'] }, offsetX: num, offsetY: num, scale: { type: 'number', exclusiveMinimum: 0 }, rotationDeg: num, repeat: { type: 'boolean', description: 'Repeat the placed image as a pattern.' } }, required: ['version', 'assetId'] }
const gradient = { type: 'object', additionalProperties: false, properties: { type: { enum: ['linear', 'radial', 'angle', 'reflected', 'diamond'] }, angle: num, stops: { type: 'array', minItems: 2, maxItems: 256, items: { type: 'object', additionalProperties: false, properties: { offset: { type: 'number', minimum: 0, maximum: 1 }, color: { type: 'string' }, opacity }, required: ['offset', 'color'] } } }, required: ['type', 'stops'] }
/** Complete shared source fill, including inactive mode settings. Image fit
 * 'fill' is the UI Stretch label; image assets remain registry IDs, not URLs. */
export function fillSchema(): Schema {
  return { type: 'object', additionalProperties: false, properties: { type: { enum: ['none', 'solid', 'gradient', 'image'] }, color: { type: 'string' }, opacity, gradient,
    image: imagePaint }, required: ['type'],
    allOf: [{ if: { properties: { type: { const: 'gradient' } } }, then: { required: ['gradient'] } }, { if: { properties: { type: { const: 'image' } } }, then: { required: ['image'] } }] }
}
/** Complete shared stroke record. None retains authored color/width/trim so
 * re-enabling never destroys source values. Omitted sibling fill is preserved. */
export function strokeSchema(): Schema {
  return { type: 'object', additionalProperties: false, properties: { type: { enum: ['none', 'solid', 'gradient', 'pattern'] }, color: { type: 'string' }, width: { type: 'number', minimum: 0 }, opacity, gradient, image: imagePaint, dashEnabled: { type: 'boolean' },
    alignment: { enum: ['inside', 'center', 'outside'] }, dashArray: { type: 'array', maxItems: 256, items: { type: 'number', minimum: 0 } }, lineCap: { enum: ['butt', 'round', 'square'] }, lineJoin: { enum: ['miter', 'round', 'bevel'] },
    trim: { type: 'object', additionalProperties: false, properties: { start: num, end: num, offset: num, mode: { enum: ['static', 'movingSegment'] }, segmentLength: { type: 'number', minimum: 0, maximum: 1 } }, required: ['start', 'end', 'offset'] } }, required: ['color', 'width'], allOf: [{ if: { properties: { type: { const: 'pattern' } }, required: ['type'] }, then: { required: ['image'] } }] }
}
