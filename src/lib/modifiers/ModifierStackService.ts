import { sourceEditingIndex } from './sourceEditing'
import { meshModifierRestIdentity } from './mesh/restIdentity'
import type { Layer } from '../types'
import type { ModifierGeometry, GeometryModifierStackData } from './geometryTypes'
import { geometryModifierRegistry, type GeometryModifierRegistry } from './builtins'
import { GeometryStackEvaluator } from './GeometryStackEvaluator'
import { geometryConversionPaint } from '../paint/geometryConversionPaint'
import { MeshFaceGeometryConverter } from '../geometry/mesh2d/selection/MeshFaceGeometryConverter'

/** Integration adapter between ordinary Layer fields and canonical stack data.
 * Source remains detached/immutable; transforms, appearance and animation live
 * outside the geometry pipeline. Legacy conversion v1 is adapted only when
 * requested, never globally rewritten on load. No renderer or storage handles. */
export class ModifierStackService {
  readonly evaluator: GeometryStackEvaluator
  constructor(readonly registry: GeometryModifierRegistry) { this.evaluator = new GeometryStackEvaluator(registry) }

  /** Borrow an existing stack or capture a private base once. Legacy conversion
   * stage IDs, edited controls and original parametric geometry are preserved. */
  stackFor(layer: Layer): GeometryModifierStackData {
    if (layer.modifierStack) return layer.modifierStack
    const legacy = layer.geometryConversion
    let source: ModifierGeometry, modifiers: GeometryModifierStackData['modifiers'] = []
    if (legacy) {
      source = { kind: 'shape', sources: legacy.sources, unionTolerancePx: legacy.unionTolerancePx }
      modifiers = legacy.stages.map(stage => ({ id: stage.id, type: stage.kind, version: 1 as const, enabled: true,
        settings: stage.kind === 'convertMesh2d' ? { tolerancePx: stage.tolerancePx } : {
          ...((layer.type === 'spline' ? layer.spline : stage.edited) ? { edited: layer.type === 'spline' ? layer.spline : stage.edited } : {}),
        } }))
    } else if (layer.type === 'spline' && layer.spline) source = { kind: 'spline', spline: layer.spline }
    else if (layer.type === 'mesh2d' && layer.mesh2d) source = { kind: 'mesh2d', mesh: { ...layer.mesh2d, deformation: undefined } }
    else if (layer.type === 'shape' && layer.size) source = { kind: 'shape', unionTolerancePx: .25, sources: [{
      type: 'shape', name: layer.name, shape: layer.shape, shapeKind: layer.shapeKind, shapeParams: layer.shapeParams,
      size: layer.size, cornerRadius: layer.style?.cornerRadius, matrix: [1, 0, 0, 1, 0, 0],
    }] }
    else throw new Error('This layer has no supported modifier geometry source.')
    if (layer.mesh2d?.deformation) modifiers = [...modifiers, { id: 'mesh-deformation', type: 'meshDeformation', version: 1, enabled: true,
      settings: { ...layer.mesh2d.deformation, topologyHash: layer.mesh2d.geometry.topology.topologyHash, restIdentity: meshModifierRestIdentity(layer.mesh2d.geometry) } }]
    return structuredClone({ version: 1, source, modifiers })
  }

  /** Validate the complete result while retaining identity/placement/paint.
   * For an admitted input-editing owner, the authored Layer keeps the input
   * spline, not the generated boundary snapshot. Frame/output consumers use
   * withGeometry/projectModifierLayer. Legacy result storage is unchanged. */
  execute(layer: Layer, stack: GeometryModifierStackData): Layer {
    const result = this.withGeometry(layer, stack, this.evaluator.execute(stack, { layerId: layer.id }))
    const index = sourceEditingIndex(stack, this.registry)
    if (index !== undefined) {
      const input = index === 0 ? stack.source : this.evaluator.execute(stack, { layerId: layer.id }, index)
      if (input.kind !== 'spline') throw new Error('The editable Outline input must be a Spline.')
      return { ...result, spline: input.spline }
    }
    return result
  }
  /** Explicitly materialize evaluated boundaries and drop the recipe. Unlike
   * execute (authoring), Bake never substitutes an editable upstream source. */
  bake(layer: Layer): Layer {
    const stack = this.stackFor(layer)
    let geometry = this.evaluator.execute(stack, { layerId: layer.id })
    if (geometry.kind === 'mesh2d' && stack.source.kind === 'mesh2d'
      && geometry.mesh.geometry.topology.topologyHash === stack.source.mesh.geometry.topology.topologyHash) {
      const cells = new MeshFaceGeometryConverter().convert(geometry.mesh.geometry, stack.source.mesh.source)
      if (cells !== geometry.mesh.geometry) {
        if (geometry.mesh.deformation || geometry.mesh.pins?.vertexIds.length) throw new Error('Clear pins and unbind deformation before baking legacy Grid face metadata.')
        geometry = { kind: 'mesh2d', mesh: { ...geometry.mesh, geometry: cells } }
      }
    }
    const result = this.withGeometry(layer, stack, geometry)
    return { ...result, modifierStack: undefined, geometryConversion: undefined, splinePaintOverrides: undefined }
  }
  /** Materialize an already evaluated result. This is the single Layer adapter
   * used by commands, viewport projection, clone and output flattening. */
  withGeometry(layer: Layer, stack: GeometryModifierStackData, geometry: ModifierGeometry): Layer {
    const { shape: _shape, shapeKind: _kind, shapeParams: _params, path: _path, spline: _spline, mesh2d: _mesh,
      geometryConversion: _legacy, ...rest } = layer
    if (geometry.kind === 'shape') {
      if (geometry.sources.length !== 1 || geometry.sources[0].type !== 'shape') throw new Error('A compound source requires an enabled Convert Spline step.')
      const source = geometry.sources[0]
      return { ...rest, type: 'shape', modifierStack: stack, shape: source.shape, shapeKind: source.shapeKind,
        shapeParams: source.shapeParams, size: source.size, style: { ...geometryConversionPaint(layer.style, layer.type, 'shape'), cornerRadius: source.cornerRadius } }
    }
    const paint = geometryConversionPaint(layer.style, layer.type, geometry.kind)
    const style = paint ? { ...paint, cornerRadius: undefined } : undefined
    if (geometry.kind === 'spline') {
      // Appearance is outside the geometry recipe. Stable generated Object IDs
      // retain explicit Properties paint when Execute rebuilds the geometry.
      const subShapes = Object.fromEntries(Object.entries(geometry.spline.subShapes).map(([id, object]) => {
        const override = layer.splinePaintOverrides?.objects[id]
        const paint = override === null ? { version: 1 as const, source: 'stroke' as const } : override ? { version: 1 as const, source: 'custom' as const, style: override }
          : layer.spline?.subShapes[id]?.paint?.source === 'custom' ? layer.spline.subShapes[id].paint : object.paint
        return [id, object.paint && paint ? { ...object, paint } : object]
      }))
      return { ...rest, type: 'spline', spline: { ...geometry.spline, subShapes }, style, modifierStack: stack }
    }
    const previous = layer.mesh2d, current = geometry.mesh
    if (previous?.pins?.vertexIds.length && meshModifierRestIdentity(previous.geometry) !== meshModifierRestIdentity(current.geometry)) throw new Error('Remove Mesh pins before changing modifier topology.')
    const selfSource = stack.modifiers.some(item => item.enabled && item.type === 'convertMesh2d') && current.source.kind === 'splineBoundary'
    const mesh = { ...current,
      ...(selfSource ? { source: { ...current.source, sourceLayerId: layer.id } } : {}),
      appearance: previous?.appearance ?? current.appearance,
      pins: previous?.pins ?? current.pins,
    }
    return { ...rest, type: 'mesh2d', mesh2d: mesh, style, modifierStack: stack }
  }
}

/** Generated result points remain readonly. An explicit input-editing owner
 * is admitted separately: its authored Layer carries original input points.
 * Conversion-only splines keep their existing authored-override contract. */
export function modifierOutputReadOnly(layer: Layer | null | undefined): boolean {
  if (layer?.modifierStack && sourceEditingIndex(layer.modifierStack, geometryModifierRegistry) !== undefined) return false
  return !!layer?.modifierStack?.modifiers.some(item => item.enabled && !geometryModifierRegistry.get(item.type).descriptor.preservesSourceEditing)
}

/** Source-vs-evaluated geometry boundary for native Edit consumers. */
export function modifierEditsInputSpline(layer?: Layer | null): boolean {
  return !!layer?.modifierStack && sourceEditingIndex(layer.modifierStack, geometryModifierRegistry) !== undefined
}
