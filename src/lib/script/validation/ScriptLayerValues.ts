import type { Layer, ChronoScene } from '../../types'
import { layerRegistry } from '../../registry'
import { PropertySchemaIndex } from '../../registry/PropertySchemaIndex'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { writePropertyPath } from '../../scene/properties/writePropertyPath'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { expressionValueType, validateExpressionResult } from '../../core/expression/ExpressionValue'
import { assertSplineTopology } from '../api/splineHandleData'
import { validateScriptParticleData } from '../api/particleValidation'
import { assertInputExpressions } from '../../editor/inputExpressions/InputExpression'
import { assertPropertyExpressions } from '../../expression/properties/PropertyExpression'
import { changedScriptPaths } from './ScriptDataChanges'
import { assertScriptPaint } from './ScriptPaintValues'
import { SCRIPT_TRANSFORM_FIELDS } from './Script2DScope'

const schemas = new PropertySchemaIndex(layer => layerRegistry.findForLayer(layer))
const recordFields = ['transform','size','style','text','image','video','audio','frameSequence','effects','motionBlur','motionPath','followPath','pathStroke','dragConfig','internalGrid','repeater','spline','particleEmitter','shapeParams','inputExpressions','propertyExpressions','paramBindings'] as const

/** Refuse invalid numbers in source units; never clamp or coerce authored data. */
export function finiteScriptNumber(value: unknown, field: string, min = -Infinity, max = Infinity): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${field}: expected a finite number in ${min}..${max}.`)
}

/** Validate a known scalar against the owning registry definition. Numeric
 * constraints use inspector source units, not step quantization. Keys may carry
 * canonical typed colors; static source keeps CSS strings. Unknown extension
 * paths retain their domain validator rather than receiving guessed types. */
export function assertScriptPropertyValue(layer: Layer, path: string, value: unknown, key = false, scene?: ChronoScene): void {
  if (path === 'twoBoneIK2d.weight') {
    if (!layer.twoBoneIK2d) throw new Error('Bind an IK chain before keying its weight.')
    finiteScriptNumber(value, path, 0, 1)
    return
  }
  // Particle source enums/uint32 seeds are wider than their inspector widgets.
  // Its existing domain validator is authoritative for both raw edits and keys.
  if (path.startsWith('particleEmitter.')) {
    if (key && scene) {
      const candidate = writePropertyPath(layer, path, value, true)
      if (candidate.particleEmitter) validateScriptParticleData(candidate.particleEmitter, scene, layer.id)
    }
    return
  }
  const schema = schemas.resolve(layer).get(path)
  if (!schema || value === undefined) return
  const kind = schema.valueType
  // A point emitter deliberately has a zero-area source box. The shared size
  // inspector's 1px lower bound describes visual boxes, not emission domains.
  if (['number', 'angle', 'percent'].includes(kind)) finiteScriptNumber(value, path, layer.type === 'particleEmitter' && /^size\./.test(path) ? 0 : schema.min, schema.max)
  else if (kind === 'boolean') validateExpressionResult('boolean', value)
  else if (kind === 'color') {
    if (!key && typeof value !== 'string') throw new Error(`${path} requires a CSS color string.`)
    if (key && value && typeof value === 'object' && expressionValueType(value) !== 'color') throw new Error('Color key channels must be canonical RGBA values in 0..255.')
    validateExpressionResult('color', value)
  } else if (kind === 'string' || kind === 'select') {
    if (typeof value !== 'string' || kind === 'select' && !schema.options?.some(option => option.value === value)) throw new Error(`Invalid ${path} value.`)
  }
}

/** Changed fields only: legacy invalid siblings and extension metadata remain
 * byte-for-byte data-equivalent. Required container invariants are checked when
 * that container is replaced. Native spline/particle/expression validators own
 * their payloads. Coordinates are local 2D pixels; times are milliseconds. */
export function assertScriptLayerValues(before: Layer | undefined, after: Layer, scene: ChronoScene): void {
  const paths = changedScriptPaths(before, after)
  const touched = (path: string) => paths.some(other => !other || propertyPathsOverlap(other, path))
  for (const field of recordFields) if (touched(field) && after[field] !== undefined && (!after[field] || typeof after[field] !== 'object' || Array.isArray(after[field]))) throw new Error(`${field} must be a source record.`)
  if (touched('name') && typeof after.name !== 'string') throw new Error('Layer name must be a string.')
  if ((touched('shapeKind') || touched('shape') || touched('shapeParams.kind')) && after.type === 'shape' && !layerRegistry.findForLayer(after)) throw new Error('Unknown 2D shape kind.')
  for (const [path] of Array.from(schemas.resolve(after))) if (touched(path)) assertScriptPropertyValue(after, path, readPropertyPath(after, path))
  if (touched('transform')) {
    if (!after.transform || Object.keys(after.transform).some(key => touched(`transform.${key}`) && !SCRIPT_TRANSFORM_FIELDS.some(field => field === key))) throw new Error('Only the complete 2D transform is supported.')
    for (const field of SCRIPT_TRANSFORM_FIELDS) if (!before || touched(`transform.${field}`)) finiteScriptNumber(after.transform[field], `transform.${field}`)
  }
  if (touched('opacity')) finiteScriptNumber(after.opacity, 'opacity', 0, 1)
  if (touched('size') && after.size) {
    for (const key of ['width', 'height'] as const) if (!before?.size || touched(`size.${key}`)) finiteScriptNumber(after.size[key], `size.${key}`, after.type === 'particleEmitter' ? 0 : 1)
  }
  for (const key of ['locked','frozen','hidden','solo','pinned','tappable','draggable'] as const) if (touched(key) && after[key] !== undefined && typeof after[key] !== 'boolean') throw new Error(`${key} must be boolean.`)
  for (const key of ['startMs', 'endMs'] as const) if (touched(key) && after[key] !== undefined) finiteScriptNumber(after[key], key, 0)
  if ((touched('startMs') || touched('endMs')) && after.endMs !== undefined && after.endMs < (after.startMs ?? 0)) throw new Error('Layer endMs precedes startMs.')
  if (touched('spline')) {
    if (after.type === 'spline' && !after.spline && !after.instanceOf) throw new Error('Spline geometry is required.')
    if (after.spline) assertSplineTopology(after.spline)
  }
  if (touched('particleEmitter') && after.particleEmitter) validateScriptParticleData(after.particleEmitter, scene, after.id)
  if (touched('inputExpressions')) assertInputExpressions(after)
  if (touched('propertyExpressions')) assertPropertyExpressions(after)
  if (touched('style')) assertScriptPaint(before, after)
  if (touched('text') && after.text) {
    if (touched('text.value') && typeof after.text.value !== 'string') throw new Error('Text value must be a string.')
    if (touched('text.fontSize')) finiteScriptNumber(after.text.fontSize, 'text.fontSize', 1)
    if (touched('text.color')) { if (typeof after.text.color !== 'string') throw new Error('Text color must be CSS.'); validateExpressionResult('color', after.text.color) }
  }
  if (touched('effects') && after.effects) for (const [field, value] of Object.entries(after.effects)) if (touched(`effects.${field}`) && value !== undefined) finiteScriptNumber(value, `effects.${field}`, 0)
  if (touched('masks') && after.masks) {
    if (!Array.isArray(after.masks)) throw new Error('Masks must be an array.')
    const ids = new Set<string>()
    for (const mask of after.masks) {
      if (!mask || typeof mask.id !== 'string' || ids.has(mask.id) || typeof mask.maskLayerId !== 'string' || !['add','subtract','intersect'].includes(mask.mode)) throw new Error('Invalid mask definition.')
      ids.add(mask.id)
      if (mask.inverted !== undefined && typeof mask.inverted !== 'boolean') throw new Error('Mask inversion must be boolean.')
      if (mask.feather !== undefined) finiteScriptNumber(mask.feather, 'mask feather', 0)
      if (mask.opacity !== undefined) finiteScriptNumber(mask.opacity, 'mask opacity', 0, 1)
    }
  }
  if (touched('path') && after.path) {
    if (!Array.isArray(after.path.anchors) || typeof after.path.closed !== 'boolean') throw new Error('Invalid path geometry.')
    for (const anchor of after.path.anchors) {
      finiteScriptNumber(anchor.x, 'path.x'); finiteScriptNumber(anchor.y, 'path.y')
      for (const axis of ['inX','inY','outX','outY'] as const) if (anchor[axis] !== undefined) finiteScriptNumber(anchor[axis], `path.${axis}`)
      if (anchor.pointType !== undefined && !['corner','smooth','mirror'].includes(anchor.pointType)) throw new Error('Invalid path point type.')
    }
  }
}
