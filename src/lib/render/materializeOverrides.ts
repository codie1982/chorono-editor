import type { AnimatableValue, ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { animatableColorToCss, isColorTarget, isColorValue, isVec2, parseAnimatableColor } from '@/lib/animation/typedValues'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import type { PropertySchema } from '@/lib/registry/PropertySchema'
import { LayerIndex } from '@/lib/scene/LayerIndex'

type PropertyOverride = { path: string[]; value: AnimatableValue }
type LayerOverrideIndex = Map<string, PropertyOverride[]>
export type RenderSchemaProvider = (layer: Layer) => readonly PropertySchema[]
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const identity = new Set(['id', 'type', 'instanceOf', 'parentId'])

/** CSS consumers also accept the legacy packed 0xRRGGBB animation value. */
export function renderColor(value: unknown, fallback = '#000000'): string {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? `#${Math.max(0, Math.min(0xffffff, Math.round(value))).toString(16).padStart(6, '0')}`
      : fallback
  }
  return typeof value === 'string' ? value : animatableColorToCss(value, fallback)
}

export function resolveRenderColor(overrides: OverrideMap, id: string, path: string, fallback: string): string {
  const value = overrides.get(`layers.${id}.${path}`)
  return value === undefined ? fallback : renderColor(value, fallback)
}

function indexOverrides(overrides: OverrideMap): LayerOverrideIndex {
  const byLayer: LayerOverrideIndex = new Map()
  overrides.forEach((value, target) => {
    const match = target.match(/^layers\.([^.]+)\.(.+)$/)
    if (!match || (typeof value === 'number' && !Number.isFinite(value))) return
    const path = match[2].split('.')
    if (identity.has(path[0]) || path.some(part => !part || forbidden.has(part))) return
    const entries = byLayer.get(match[1]) ?? []
    entries.push({ path, value })
    byLayer.set(match[1], entries)
  })
  return byLayer
}

/** Persistent update: untouched objects/arrays retain identity. Array tracks
 * address existing entries only; a bad index cannot allocate a huge array. */
function setProperty(object: unknown, path: string[], value: unknown, depth = 0): unknown {
  const key = path[depth]
  if (Array.isArray(object) && (!/^\d+$/.test(key) || Number(key) >= object.length)) return object
  const source = object && typeof object === 'object' ? object as Record<string, unknown> : {}
  const previous = source[key]
  let next: unknown
  if (depth === path.length - 1) {
    if (isColorValue(previous)) {
      const parsed = parseAnimatableColor(value)
      if (!parsed) return object
      value = parsed
    }
    if (previous != null && typeof previous !== typeof value) return object
    if (typeof previous === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return object
    // Vec2 tracks address an existing point/transform without destroying its
    // id, handles, scale or other authored metadata.
    next = isVec2(value) && previous && typeof previous === 'object'
      ? { ...previous, ...value } : value
  } else next = setProperty(previous, path, value, depth + 1)
  if (Object.is(previous, next)) return object
  const clone = Array.isArray(object) ? object.slice() : { ...source }
  ;(clone as Record<string, unknown>)[key] = next
  return clone
}

// Optional numeric fields may be absent in authored data. Their broad families
// still have fixed numeric types even when no schema provider was supplied.
const numericPath = /^(?:opacity|transform\.[^.]+|size\.(?:width|height)|effects\.[^.]+|shapeParams\.(?!kind$)[^.]+|style\.(?:cornerRadius|(?:fill|stroke)\.(?:opacity|width)|stroke\.trim\.(?:start|end|offset))|text\.(?:fontSize|letterSpacing|lineHeight)|followPath\.(?:progress|rotationOffset|perpendicularOffset))$/

function applyLayerOverrides(layer: Layer, entries: PropertyOverride[] | undefined, schemasForLayer?: RenderSchemaProvider): Layer {
  let result = layer
  if (!entries?.length) return result
  const schemas = new Map(schemasForLayer?.(layer).map(schema => [schema.path, schema]) ?? [])
  for (const { path, value } of entries ?? []) {
    const property = path.join('.')
    const schema = schemas.get(property)
    const expectsNumber = schema ? ['number', 'angle', 'percent'].includes(schema.valueType) : numericPath.test(property)
    if (expectsNumber && (typeof value !== 'number' || !Number.isFinite(value))) continue
    if (schema?.valueType === 'boolean' && typeof value !== 'boolean') continue
    if (schema && ['string', 'select'].includes(schema.valueType) && typeof value !== 'string') continue
    const bounded = expectsNumber && typeof value === 'number'
      ? Math.max(schema?.min ?? -Infinity, Math.min(schema?.max ?? Infinity, value)) : value
    // Particle lifetime gradients intentionally store ColorValue objects;
    // their stop `value` is distinct from CSS `color` fields.
    const color = isColorTarget(property)
    // Particle colors are canonical RGBA data, rather than canvas CSS fields.
    const projected = color && path[0] === 'particleEmitter'
      ? parseAnimatableColor(bounded) ?? bounded
      : color && (typeof bounded === 'number' || isColorValue(bounded)) ? renderColor(bounded) : bounded
    result = setProperty(result, path, projected) as Layer
  }
  return result
}

/** Materialize numeric/typed leaf values for a standalone draw/helper call. */
export function materializeLayerOverrides(layer: Layer, overrides: OverrideMap, schemasForLayer?: RenderSchemaProvider): Layer {
  return applyLayerOverrides(layer, indexOverrides(overrides).get(layer.id), schemasForLayer)
}

/** Resolve live instances BEFORE animation. Source edits propagate, while a
 * source animation never overwrites an instance's independent visual tracks.
 * One index per frame avoids scanning every track for every particle/copy. */
export function materializeRenderScene(scene: ChronoScene, overrides: OverrideMap, schemasForLayer?: RenderSchemaProvider): ChronoScene {
  const index = indexOverrides(overrides)
  // Source lookups stay separate from the projected frame so an instance
  // cannot inherit its source's evaluated animation. Build only if needed.
  let sourceIndex: LayerIndex | undefined
  let changed = false
  const layers = scene.layers.flatMap(layer => {
    if (layer.instanceOf) sourceIndex ??= new LayerIndex(scene.layers)
    const resolved = resolveInstanceLayer(layer, scene.layers, 0, sourceIndex)
    if (!resolved) { changed = true; return [] }
    let projected = applyLayerOverrides(resolved, index.get(layer.id), schemasForLayer)
    // This is a render-only snapshot. Downstream bounds/path helpers must
    // not resolve it again against an already animated source snapshot.
    if (projected.instanceOf) projected = { ...projected, instanceOf: undefined }
    if (projected !== layer) changed = true
    return [projected]
  })
  return changed ? { ...scene, layers } : scene
}
