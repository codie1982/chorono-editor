import type { ChronoScene, Layer } from '../types'
import type { ConversionSource, GeometryConversionData } from '../types/geometryConversion'
import type { EditorCommand } from './commands-keyframe'
import { GeometryConversionService } from '../geometry/conversion/GeometryConversionService'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { Matrix2D } from '../geometry/Matrix2D'
import { assertStaticBooleanInput } from '../booleanOperations/validation'
import { assertLayerUnreferenced } from '../scene/references/assertLayerUnreferenced'

export type ConversionTarget = 'spline' | 'mesh2d'
const geometryField = /^(?:size|shapeParams|shapeKind|shape|spline|style\.cornerRadius)(?:\.|$)/

/** Refuse competing geometry writers instead of silently baking one frame.
 * Single-source transform, opacity and paint animations remain untouched.
 * Multi-source union follows the existing static Boolean ownership policy. */
function assertConversionInput(scene: ChronoScene, layer: Layer, multiple: boolean): void {
  if (!['shape', 'spline'].includes(layer.type) || layer.hidden || layer.locked || layer.frozen || layer.instanceOf
    || layer.booleanResultFor || layer.booleanOperation) throw new Error('Convert requires visible, unlocked Basic Shapes or editable Splines.')
  if (scene.layers.some(item => item.parentId === layer.id)) throw new Error('Convert the geometry inside the group, not its container.')
  if (multiple) { assertStaticBooleanInput(scene, layer); return }
  const driven = (path: string) => geometryField.test(path)
  if (scene.timelines.some(timeline => timeline.tracks.some(track => track.target.startsWith(`layers.${layer.id}.`) && driven(track.target.slice(`layers.${layer.id}.`.length))))
    || Object.keys(layer.propertyExpressions?.fields ?? {}).some(driven)
    || Object.keys(layer.paramBindings ?? {}).some(driven)
    || scene.parameterWires?.some(wire => wire.target.layerId === layer.id && driven(wire.target.propertyPath ?? ''))
    || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id && driven(binding.target.property ?? '')))
    throw new Error('Geometry has animation or live drivers. Bake a static geometry source before Convert; transform and paint animation can remain.')
}

/** Capture detached geometry only. Matrix coordinates are result-local pixels;
 * source IDs, runtime handles and external asset references never enter recipes. */
function captureSource(layer: Layer, matrix: Matrix2D): ConversionSource {
  return structuredClone({ type: layer.type as 'shape' | 'spline', name: layer.name,
    shape: layer.shape, shapeKind: layer.shapeKind, shapeParams: layer.shapeParams,
    size: layer.size, cornerRadius: layer.style?.cornerRadius, spline: layer.spline,
    matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] as const })
}

/** Plan one atomic replacement in scene stacking order, retaining the primary
 * layer's ID/placement/lifetime/paint. Secondary IDs require zero readers and
 * contiguous siblings, so unrelated draw order and references cannot change.
 * The original geometry remains in the serializable modifier source. */
export function prepareGeometryConversion(scene: ChronoScene, layerIds: readonly string[], target: ConversionTarget) {
  const ids = new Set(layerIds)
  if (!ids.size || ids.size > 8) throw new Error('Select 1–8 Basic Shapes or Splines to convert.')
  const sources = scene.layers.filter(layer => ids.has(layer.id))
  if (sources.length !== ids.size) throw new Error('A conversion source no longer exists.')
  sources.forEach(layer => assertConversionInput(scene, layer, sources.length > 1))
  const primary = sources[0]
  if (sources.length > 1) {
    if (sources.some(layer => layer.parentId !== primary.parentId)) throw new Error('Union conversion requires objects under the same parent.')
    if (sources.some(layer => (layer.startMs ?? 0) !== (primary.startMs ?? 0) || (layer.endMs ?? scene.composition.durationMs) !== (primary.endMs ?? scene.composition.durationMs)))
      throw new Error('Union conversion requires objects with the same lifetime.')
    const siblings = scene.layers.filter(layer => layer.parentId === primary.parentId)
    const positions = siblings.flatMap((layer, i) => ids.has(layer.id) ? [i] : [])
    if (positions.at(-1)! - positions[0] + 1 !== positions.length) throw new Error('Select contiguous objects to preserve unrelated stacking.')
    sources.slice(1).forEach(layer => assertLayerUnreferenced(scene, layer.id, 'A selected object has external readers. Remove or retarget those references before union conversion.'))
  }
  const world = resolveLayerWorldMatrix(primary, scene, 0, new Map())
  if (Math.abs(world.determinant()) < 1e-9) throw new Error('Conversion cannot use a singular layer transform.')
  const inverse = world.invert()
  const previous = sources.length === 1 ? primary.geometryConversion : undefined
  const recipe: GeometryConversionData = previous ? {
    ...previous, stages: [{ id: previous.stages[0]?.id ?? 'convert-spline', kind: 'convertSpline', edited: primary.spline }],
  } : { version: 1, sources: sources.map(layer => captureSource(layer, sources.length === 1 ? Matrix2D.identity()
    : inverse.multiply(resolveLayerWorldMatrix(layer, scene, 0, new Map())))),
    unionTolerancePx: .25, stages: [{ id: 'convert-spline', kind: 'convertSpline' }] }
  const finalRecipe: GeometryConversionData = target === 'mesh2d'
    ? { ...recipe, stages: [...recipe.stages, { id: 'convert-mesh2d', kind: 'convertMesh2d', tolerancePx: .25 }] } : recipe
  const result = new GeometryConversionService().apply(primary, finalRecipe)
  const candidate = { ...scene, layers: scene.layers.flatMap(layer => layer.id === primary.id ? [result] : ids.has(layer.id) ? [] : [layer]),
    timelines: scene.timelines.map(timeline => ({ ...timeline, layerIds: timeline.layerIds?.filter(id => !ids.has(id) || id === primary.id) })) }
  return { layerId: primary.id, command: replacementCommand(scene, candidate, `Convert ${sources.length > 1 ? 'union' : primary.name} to ${target === 'spline' ? 'Spline' : '2D Mesh'}`) }
}

/** Update/rebuild a saved modifier prefix in one undo step. Edited spline
 * controls are captured before appending/removing Mesh; rebuilding the source
 * explicitly clears edits. Pin/deformation attachments refuse topology changes. */
export function makeGeometryConversionStackCmd(scene: ChronoScene, id: string, recipe: GeometryConversionData): EditorCommand {
  const source = scene.layers.find(layer => layer.id === id)
  if (!source?.geometryConversion || source.locked || source.frozen || source.hidden || source.instanceOf) throw new Error('Select an unlocked converted object.')
  if (source.mesh2d?.deformation || source.mesh2d?.pins?.vertexIds.length) throw new Error('Remove deformation and pins before rebuilding conversion topology.')
  const geometrySource = source.type === 'mesh2d' ? { ...source, type: 'spline' as const } : source
  assertConversionInput(scene, geometrySource, false)
  const result = new GeometryConversionService().apply(source, recipe)
  if (result.mesh2d && source.mesh2d?.appearance) result.mesh2d = { ...result.mesh2d, appearance: source.mesh2d.appearance }
  return replacementCommand(scene, { ...scene, layers: scene.layers.map(layer => layer.id === id ? result : layer) }, 'Edit geometry conversion stack')
}

/** Compare-and-swap immutable scene command: stale previews cannot overwrite
 * edits. Undo restores exact source IDs, order, data and timeline membership. */
function replacementCommand(before: ChronoScene, after: ChronoScene, label: string): EditorCommand {
  return { label, execute: current => {
    if (current.layers !== before.layers || current.timelines !== before.timelines) throw new Error('Scene changed. Convert again from the current selection.')
    return after
  }, undo: () => before }
}
