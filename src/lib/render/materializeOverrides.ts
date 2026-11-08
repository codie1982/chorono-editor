import type { AnimatableValue, ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { animatableColorToCss, isColorTarget, isColorValue, isVec2, parseAnimatableColor } from '@/lib/animation/typedValues'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import type { PropertySchema } from '@/lib/registry/PropertySchema'
import { LayerIndex } from '@/lib/scene/LayerIndex'

type PropertyOverride = { path: string[]; value: AnimatableValue }
type LayerOverrideIndex = Map<string, PropertyOverride[]>
/** Existing array providers remain supported; compiled consumers may borrow a
 * readonly path index to avoid rebuilding identical validation maps per layer. */
export type RenderSchemaProvider = (layer: Layer) => readonly PropertySchema[] | ReadonlyMap<string, PropertySchema>
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

/** Copy-on-write update in one projection's private ownership scope. Only
 * containers cloned by this projection may be changed in place; caller/source/value
 * objects remain borrowed. Repeated sibling writes reuse their already private
 * parent instead of copying it for every track. The last private container at each
 * depth is enough: switching branches may make another copy, but can never
 * treat a borrowed value as owned. This O(path depth) scratch avoids retaining
 * and hashing every cloned frame object. It is not shared between frames. Unchanged branches keep identity. Array tracks address
 * existing entries only; an invalid index cannot allocate a huge sparse array.
 * Writes retain the original sequential Map order, including parent/child paths. */
function setProperty(object: unknown, path: string[], value: unknown, copies: Array<object | undefined>, depth = 0): unknown {
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
  } else next = setProperty(previous, path, value, copies, depth + 1)
  if (Object.is(previous, next)) return object
  // Legacy noncanonical array paths such as "01" create a string property,
  // which the next Array.slice intentionally drops. Do not retain that property
  // through in-place reuse; canonical integer paths take the fast owned route.
  const legacyArrayKey = Array.isArray(object) && String(Number(key)) !== key
  const clone = copies[depth] === source && !legacyArrayKey ? source : Array.isArray(object) ? object.slice() : { ...source }
  copies[depth] = legacyArrayKey ? undefined : clone
  ;(clone as Record<string, unknown>)[key] = next
  return clone
}

// Optional numeric fields may be absent in authored data. Their broad families
// still have fixed numeric types even when no schema provider was supplied.
const numericPath = /^(?:opacity|transform\.[^.]+|size\.(?:width|height)|effects\.[^.]+|shapeParams\.(?!kind$)[^.]+|style\.(?:cornerRadius|(?:fill|stroke)\.(?:opacity|width)|stroke\.trim\.(?:start|end|offset))|text\.(?:fontSize|letterSpacing|lineHeight)|followPath\.(?:progress|rotationOffset|perpendicularOffset))$/

/** Validate and project one layer through the per-call private container scratch. The
 * schema provider is read-only and receives the authored/resolved layer. */
function applyLayerOverrides(layer: Layer, entries: PropertyOverride[] | undefined, copies: Array<object | undefined>, schemasForLayer?: RenderSchemaProvider): Layer {
  let result = layer
  if (!entries?.length) return result
  const supplied = schemasForLayer?.(layer)
  const schemas: ReadonlyMap<string, PropertySchema> = !supplied ? new Map()
    : isSchemaArray(supplied) ? new Map(supplied.map(schema => [schema.path, schema])) : supplied
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
    result = setProperty(result, path, projected, copies) as Layer
  }
  return result
}

/** Narrows legacy array providers without requiring a particular map backend. */
function isSchemaArray(value: ReturnType<RenderSchemaProvider>): value is readonly PropertySchema[] {
  return Array.isArray(value)
}

/** Materialize numeric/typed leaf values for a standalone draw/helper call. */
export function materializeLayerOverrides(layer: Layer, overrides: OverrideMap, schemasForLayer?: RenderSchemaProvider): Layer {
  return applyLayerOverrides(layer, indexOverrides(overrides).get(layer.id), [], schemasForLayer)
}

/**
 * Produce an immutable render snapshot in authored stacking order. The input
 * scene contains a dense array of valid layers; neither it nor its nested data
 * is mutated. Unchanged layers/branches retain identity, and a wholly unchanged
 * frame returns the original scene and layer array. An output array is allocated
 * only when the first layer changes or is omitted, copying its unchanged prefix.
 *
 * Instances resolve against authored sources BEFORE animation, so source edits
 * propagate without inheriting the source's independent evaluated tracks.
 * Missing/cyclic/over-depth instances follow resolveInstanceLayer's omission
 * contract. Resolved snapshots clear instanceOf to prevent a second resolution
 * against already animated data. Typed validation, color conversion and schema
 * limits reuse the same leaf projection as standalone layer rendering.
 *
 * Overrides address layer IDs; one per-call index avoids scanning all tracks per
 * layer. A private per-call depth scratch permits reusing cloned parent branches across
 * consecutive sibling writes. Only copies created here enter that scratch. No
 * snapshot, index, scratch or output is retained internally between calls.
 */
export function materializeRenderScene(scene: ChronoScene, overrides: OverrideMap, schemasForLayer?: RenderSchemaProvider): ChronoScene {
  const index = indexOverrides(overrides)
  const copies: Array<object | undefined> = []
  // Source lookups stay separate from the projected frame so an instance
  // cannot inherit its source's evaluated animation. Build only if needed.
  let sourceIndex: LayerIndex | undefined
  let layers: Layer[] | undefined
  for (let position = 0; position < scene.layers.length; position++) {
    const layer = scene.layers[position]
    if (layer.instanceOf) sourceIndex ??= new LayerIndex(scene.layers)
    const resolved = resolveInstanceLayer(layer, scene.layers, 0, sourceIndex)
    if (!resolved) {
      layers ??= scene.layers.slice(0, position)
      continue
    }
    let projected = applyLayerOverrides(resolved, index.get(layer.id), copies, schemasForLayer)
    // This is a render-only snapshot. Downstream bounds/path helpers must
    // not resolve it again against an already animated source snapshot.
    if (projected.instanceOf) projected = { ...projected, instanceOf: undefined }
    if (projected !== layer) layers ??= scene.layers.slice(0, position)
    layers?.push(projected)
  }
  return layers ? { ...scene, layers } : scene
}
