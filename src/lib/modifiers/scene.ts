import type { ChronoScene, Layer } from '../types'
import type { ModifierGeometry, GeometryModifierStackData } from './geometryTypes'
import { geometryModifierRegistry } from './builtins'
import { ModifierStackService } from './ModifierStackService'
import { modifierGeometryDriverReason } from './sourcePolicy'

export const modifierStackService = new ModifierStackService(geometryModifierRegistry)
interface CacheEntry { source: WeakRef<GeometryModifierStackData>; geometry: ModifierGeometry; bytes: number }
const cache: CacheEntry[] = []
const MAX_BYTES = 16 * 1024 ** 2
let lastProjection: { source: WeakRef<ChronoScene>; result: WeakRef<ChronoScene> } | undefined
/** Explicit bounded cache disposal for document/resource lifecycle checks. */
export function clearModifierGeometryCache(): void { cache.length = 0; lastProjection = undefined }
/** Accounting is an estimated derived-payload budget, not a heap measurement. */
export function modifierGeometryCacheStatistics() { return { entries: cache.length, bytes: cache.reduce((n, entry) => n + entry.bytes, 0), maxBytes: MAX_BYTES } }

/** Static stack geometry depends on source/settings, not layer transform/time.
 * Eight weak-source entries / 16 MiB bound retained derived results; no second
 * dense history grows with Undo or playback. Layer/scene objects are not cached. */
function geometryFor(stack: GeometryModifierStackData, layerId: string): ModifierGeometry {
  const known = cache.findIndex(entry => entry.source.deref() === stack)
  if (known >= 0) { const entry = cache.splice(known, 1)[0]; cache.push(entry); return entry.geometry }
  const geometry = modifierStackService.evaluator.execute(stack, { layerId })
  const bytes = geometry.kind === 'spline' ? (Object.keys(geometry.spline.points).length + Object.keys(geometry.spline.handles).length) * 512
    : geometry.kind === 'mesh2d' ? (geometry.mesh.geometry.positions.length + geometry.mesh.geometry.uvs.length + geometry.mesh.geometry.topology.triangleIndices.length) * 8 : 1024
  while (cache.length && (cache.length >= 8 || cache.reduce((n, entry) => n + entry.bytes, 0) + bytes > MAX_BYTES)) cache.shift()
  if (bytes <= MAX_BYTES) cache.push({ source: new WeakRef(stack), geometry, bytes })
  return geometry
}

/** Read-only projection for render/bounds/picking. Output is ordinary geometry
 * with the source recipe removed, so repeated frame materialization is safe.
 * Invalid external recipes hide only that layer in viewport; strict IO/output
 * admission throws instead of exporting a stale result or fallback source. */
export function projectModifierLayer(layer: Layer, strict = false): Layer {
  if (!layer.modifierStack || layer.instanceOf) return layer
  try {
    const result = modifierStackService.withGeometry(layer, layer.modifierStack, geometryFor(layer.modifierStack, layer.id))
    return { ...result, modifierStack: undefined }
  } catch (error) { if (strict) throw error; return { ...layer, modifierStack: undefined, hidden: true } }
}
/** Project stack owners before Boolean operands; instances resolve from those
 * ordinary visual sources in the existing instance adapter. Original JSON stays
 * untouched. Legacy scenes without stacks preserve exact object identity. */
export function projectModifierStacks(scene: ChronoScene, strict = false): ChronoScene {
  if (!scene.layers.some(layer => layer.modifierStack && !layer.instanceOf)) return scene
  const known = !strict && lastProjection?.source.deref() === scene ? lastProjection.result.deref() : undefined
  if (known) return known
  const result = { ...scene, layers: scene.layers.map(layer => projectModifierLayer(layer, strict)) }
  if (!strict) lastProjection = { source: new WeakRef(scene), result: new WeakRef(result) }
  return result
}
/** Source admission re-evaluates every stack, including disabled-record schema.
 * The derived snapshots need not be trusted or persisted as authority. */
export function assertSceneModifierStacks(scene: ChronoScene): void {
  for (const layer of scene.layers) if (layer.modifierStack) {
    if (layer.geometryConversion) throw new Error('A layer cannot have both a legacy conversion recipe and a modifier stack.')
    const reason = modifierGeometryDriverReason(scene, layer)
    if (reason) throw new Error(reason)
    modifierStackService.evaluator.validate(layer.modifierStack)
    if (!layer.instanceOf) modifierStackService.execute(layer, layer.modifierStack)
  }
}
/** Strict portable runtime geometry. Source recipes belong only in editable
 * project JSON; disabled operations are reflected in the flattened output. */
export function flattenModifierStacksForOutput(scene: ChronoScene): ChronoScene {
  assertSceneModifierStacks(scene)
  return projectModifierStacks(scene, true)
}
