import type { ChronoScene, Layer, ParameterRef } from '../../types'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

/** Serializable live numeric/boolean driver. Time is explicitly timeline-local ms;
 * sources are named stable refs, not executable property-access strings.
 * Source leaf remains the authored fallback. Dense outputs/ASTs stay runtime-only.
 * timeOffsetMs is a clone/Array delay, applied after timeline-local clock mapping. */
export interface PropertyExpression {
  resultType: 'number' | 'boolean'
  formula: string
  timelineId: string
  sources: Record<string, ParameterRef>
  timeOffsetMs?: number
  min?: number
  max?: number
}
export interface PropertyExpressions { version: 1; fields: Record<string, PropertyExpression> }
export const MAX_PROPERTY_EXPRESSIONS = 512
export const EXPRESSION_CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E })
const reserved = new Set(['pi', 'e', 'timeMs', 'timeSec', 'timeNormalized', '__proto__', 'prototype', 'constructor'])

/** Named inputs must be bounded own identifiers, distinct from built-in clocks
 * and constants. No dotted access or prototype shadowing is accepted. */
export function assertExpressionSourceName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,47}$/.test(name) || reserved.has(name)) throw new Error(`Invalid or reserved expression source name: ${name}`)
}

/** Validate source shape without running saved expressions. Missing referenced
 * objects/timelines remain portable broken refs with visible runtime fallback;
 * invalid envelope/type/path/budget fails at the load boundary. */
export function assertPropertyExpressions(layer: Layer): void {
  const data = layer.propertyExpressions
  if (data === undefined) return
  if (!data || data.version !== 1 || !data.fields || typeof data.fields !== 'object' || Array.isArray(data.fields)
    || Object.keys(data.fields).length > 128) throw new Error('Invalid property expression envelope.')
  for (const [path, value] of Object.entries(data.fields)) {
    if (!path || path.length > 256 || path.split('.').length > 16) throw new Error('Invalid expression target path.')
    readPropertyPath(layer, path)
    if (!value || !['number', 'boolean'].includes(value.resultType) || typeof value.formula !== 'string' || value.formula.length > 4096
      || typeof value.timelineId !== 'string' || !value.timelineId || value.timelineId.length > 256
      || !value.sources || typeof value.sources !== 'object' || Array.isArray(value.sources) || Object.keys(value.sources).length > 16) throw new Error('Invalid live property expression.')
    for (const limit of [value.min, value.max, value.timeOffsetMs]) if (limit !== undefined && !Number.isFinite(limit)) throw new Error('Expression bounds/offset must be finite.')
    if (value.min !== undefined && value.max !== undefined && value.min > value.max) throw new Error('Expression minimum exceeds maximum.')
    if (value.resultType === 'boolean' && (value.min !== undefined || value.max !== undefined)) throw new Error('Boolean expressions do not have numeric bounds.')
    for (const [name, ref] of Object.entries(value.sources)) {
      assertExpressionSourceName(name)
      if (!ref || !['number', 'boolean'].includes(ref.valueType) || typeof ref.propertyPath !== 'string' || ref.propertyPath.length > 256
        || ref.layerId !== undefined && (typeof ref.layerId !== 'string' || !ref.layerId || ref.layerId.length > 256)
        || ref.modifierId !== undefined) throw new Error('Expression sources require stable scalar layer/parameter references.')
      readPropertyPath({}, ref.propertyPath)
    }
  }
}

/** Validate the bounded source envelope once at import/commit boundaries. A
 * scene cannot silently create more live work than the runtime graph budget. */
export function assertScenePropertyExpressions(scene: Pick<ChronoScene, 'layers'>): void {
  let count = 0
  for (const layer of scene.layers) {
    if (layer.propertyExpressions === undefined) continue
    assertPropertyExpressions(layer)
    count += Object.keys(layer.propertyExpressions?.fields ?? {}).length
    if (count > MAX_PROPERTY_EXPRESSIONS) throw new Error('Scene exceeds 512 live property expressions; bake or reduce drivers.')
  }
}
