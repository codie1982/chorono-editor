import type { Layer, ParameterRef } from '../../types'
import { layerRegistry } from '../../registry'
import { PropertySchemaIndex } from '../../registry/PropertySchemaIndex'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { isColorTarget } from '../../animation/typedValues'
import { splineCoordinateAddress } from '../../spline/animation/splineCoordinateAddress'
import { isVec2 } from '../../geometry/CoordinateSystem'
import type { NumericConstraints } from '../../core/expression/NumericResult'
import type { ExpressionValue, ExpressionValueType } from '../../core/expression/ExpressionValue'

/** Historical name remains compatible; select controls have string results. */
export type ScalarExpressionType = ExpressionValueType
export interface ScalarPropertyConstraints extends NumericConstraints {
  readonly defaultValue?: ExpressionValue
  readonly options?: readonly string[]
  readonly live: boolean
}
const schemas = new PropertySchemaIndex(layer => layerRegistry.findForLayer(layer))
const structural = /(?:^|\.)(?:id|type|kind|parentId|assetId|sourceLayerId|pathLayerId|maskLayerId|instanceOf|src|url|presetId)(?:\.|$)/
const owned = /^(?:opacity|blendMode|transform\.[A-Za-z]+|size\.(?:width|height)|shapeParams\.[A-Za-z]+|style\.[A-Za-z.]+|text\.[A-Za-z.]+|effects\.[A-Za-z]+|(?:particleEmitter|repeater|audio|video|image|frameSequence|pathStroke|followPath|motionBlur)\.[A-Za-z.]+)$/

/** Borrow one schema default for an existing layer; no layer is invented. */
export function expressionPropertyDefault(layer: Layer, path: string): unknown { return schemas.resolve(layer).get(path)?.defaultValue }

/** Resolve type, source bounds/options and playback capability from the schema.
 * Stable-ID spline coordinates are supported; identity/asset/topology and
 * positional-array fields remain outside generic formulas. Configuration-only
 * fields may save a constant recipe without implicit per-frame jobs or media/
 * solver lifecycle changes. This query does not mutate or enforce edit locks. */
export function propertyExpressionConstraints(layer: Layer, path: string, kind: ScalarExpressionType, mode: 'constant' | 'live' = 'live'): ScalarPropertyConstraints {
  if (!path || path.length > 256) throw new Error('Expression path exceeds 256 characters.')
  const schema = schemas.resolve(layer).get(path), point = !!splineCoordinateAddress(path)
  const structuralException = !!schema && ['select', 'string'].includes(schema.valueType) && /^(?:style|text|particleEmitter|repeater|image|frameSequence|pathStroke)\./.test(path) && !/(?:Id|src|url)$/.test(path)
  if ((!owned.test(path) && !point && path !== 'path.closed') || structural.test(path) && !structuralException) throw new Error('This field has no safe expression target contract.')
  const value = readPropertyPath(layer, path)
  const declared = schema?.animationValueType ?? (schema && ['angle', 'percent'].includes(schema.valueType) ? 'number' : schema?.valueType === 'select' ? 'string' : schema?.valueType)
  const actual = isColorTarget(path) ? 'color' : isVec2(value) && point ? 'vec2' : typeof value
  if ((declared ?? actual) !== kind || !schema && value === undefined) throw new Error(kind === 'number' ? 'This field is not a numeric expression target.' : 'A ' + kind + ' expression is not supported for this field.')
  const visual = /^(?:opacity|blendMode|transform\.|size\.|shapeParams\.|style\.|text\.|effects\.|path\.)/.test(path)
  const live = visual || point || !!schema?.animatable || /^image\./.test(path)
  if (mode === 'live' && !live) throw new Error('This control supports formulas evaluated when applied; live evaluation is unavailable.')
  return { min: schema?.min, max: schema?.max, defaultValue: schema?.defaultValue,
    options: schema?.valueType === 'select' ? schema.options?.map(option => option.value) : undefined, live }
}

/** Strict source picker catalogue from the same field capability contract.
 * Stable spline vectors and components are explicit; no index/asset refs are
 * guessed. Legacy Wire enumeration remains unchanged through its own adapter. */
export function listExpressionLayerRefs(layer: Layer): ParameterRef[] {
  const paths = new Set(schemas.resolve(layer).keys())
  for (const family of ['points', 'handles'] as const) for (const id of Object.keys(layer.spline?.[family] ?? {})) {
    const path = 'spline.' + family + '.' + id
    paths.add(path); paths.add(path + '.x'); paths.add(path + '.y')
  }
  const result: ParameterRef[] = []
  for (const path of Array.from(paths)) for (const valueType of ['number','boolean','string','color','vec2'] as const) {
    try { propertyExpressionConstraints(layer, path, valueType, 'constant'); result.push({layerId:layer.id, propertyPath:path, valueType}); break } catch { /* Unsupported family/identity is not a source entry. */ }
  }
  return result
}
