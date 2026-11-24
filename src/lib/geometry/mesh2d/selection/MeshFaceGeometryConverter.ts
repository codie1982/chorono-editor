import type { Mesh2DGeometry, Mesh2DSource } from '../../../types/mesh2d'
import { Mesh2DTopologyHasher } from '../Mesh2DTopologyHasher'
import { meshFaceQuads } from './MeshFaceTopology'

/** Explicit Bake adapter for old triangle-only structured grids. Materializes
 * validated logical cells without moving vertices/UVs or changing triangles.
 * Added cell connectivity gets a new hash; callers own attachment admission.
 * Ordinary selection/file opening never invokes this conversion. Stateless. */
export class MeshFaceGeometryConverter {
  /** Return the same geometry when cells already exist or no verified recipe
   * exists; otherwise preserve position/UV buffers and hash new cell metadata. */
  convert(geometry: Mesh2DGeometry, source?: Mesh2DSource): Mesh2DGeometry {
    if (geometry.topology.quadIndices) return geometry
    const quadIndices = meshFaceQuads(geometry, source)
    if (!quadIndices.length) return geometry
    const topology = { ...geometry.topology, quadIndices }
    return { ...geometry, topology: { ...topology, topologyHash: new Mesh2DTopologyHasher().hash(topology) } }
  }
}
