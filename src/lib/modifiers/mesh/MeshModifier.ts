import { Modifier } from '../Modifier'
import type { GeometryModifierDescriptor, ModifierGeometry, ModifierContext } from '../geometryTypes'
import type { Mesh2DData, Mesh2DGeometry } from '../../types/mesh2d'
import { Mesh2DBoundaryRingExtractor } from '../../geometry/mesh2d/Mesh2DBoundaryRingExtractor'

/** Mesh-modeling adapter over the general Modifier base. Algorithms own geometry
 * only; this boundary rejects incompatible clip/pin/bake ownership and rebuilds
 * portable stroke rings against final connectivity. No scene/renderer resources
 * are owned. Original generator metadata stays in the canonical stack source;
 * changed output is an authored mesh snapshot, including after Bake/export. */
export abstract class MeshModifier extends Modifier<ModifierGeometry, ModifierContext, GeometryModifierDescriptor> {
  /** Borrow Mesh input and return a complete result; failures publish nothing. */
  protected evaluate(input: ModifierGeometry, context: ModifierContext): ModifierGeometry {
    if (input.kind !== 'mesh2d') throw new Error('Mesh geometry required.')
    if (input.mesh.deformation?.assetId) throw new Error('Place mesh modeling modifiers before Deformation Clip, or disable the clip.')
    if (input.mesh.pins?.vertexIds.length) throw new Error('Remove Mesh pins before applying geometry modifiers.')
    if (input.mesh.source.kind === 'fractureFragment') throw new Error('Fracture Mesh geometry is bake-owned. Use an independent mesh source for modeling.')
    const geometry = this.evaluateMesh(input.mesh.geometry, context)
    if (geometry === input.mesh.geometry) return input
    const mesh: Mesh2DData = { ...input.mesh, geometry, source: { kind: 'authored', schemaVersion: 1 },
      boundaryRings: new Mesh2DBoundaryRingExtractor().extract(geometry).map(ring => ring.vertexIndices) }
    return { kind: 'mesh2d', mesh }
  }
  /** Implementations preserve input arrays and return validated local geometry. */
  protected abstract evaluateMesh(input: Mesh2DGeometry, context: ModifierContext): Mesh2DGeometry
}
