import type { Mesh2DGeometry } from '../../../types/mesh2d'
import { Mesh2DTopologyValidator } from '../Mesh2DTopologyValidator'
import { Mesh2DAdjacencyBuilder, type Mesh2DAdjacency } from '../Mesh2DAdjacencyBuilder'

/** Shared admission/budget for synchronous, local-pixel mesh modeling.
 * The existing topology validator and adjacency builder remain authoritative.
 * No geometry, mutable arrays or renderer resources are retained between jobs. */
export class MeshModelingTopology {
  static readonly maxBoundaryVertices = 4096
  static readonly maxVertices = 262144
  static readonly maxTriangles = 524288
  /** Validate before connectivity queries or output allocation; no repair. */
  prepare(geometry: Mesh2DGeometry): Mesh2DAdjacency {
    this.assertBudget(geometry.topology.vertexIds.length, geometry.topology.triangleIndices.length / 3)
    const result = new Mesh2DTopologyValidator().validate(geometry)
    if (!result.valid) throw new Error(`Invalid modeling mesh: ${result.diagnostics.filter(item => item.severity === 'error').map(item => item.code).join(', ')}.`)
    if (!geometry.topology.triangleIndices.length) throw new Error('Mesh modeling requires at least one triangle.')
    const adjacency = new Mesh2DAdjacencyBuilder().build(geometry.topology)
    if (adjacency.boundaryEdges.length > MeshModelingTopology.maxBoundaryVertices) throw new Error('Mesh boundary budget exceeded. Reduce Subdivision levels or source detail.')
    const boundaryDegree = new Map<number, number>()
    adjacency.boundaryEdges.forEach(edge => edge.vertices.forEach(vertex => boundaryDegree.set(vertex, (boundaryDegree.get(vertex) ?? 0) + 1)))
    if (Array.from(boundaryDegree.values()).some(degree => degree !== 2)) throw new Error('Mesh modeling requires closed, non-branching boundaries.')
    return adjacency
  }
  /** Bound final vertex/triangle counts before dense allocation. */
  assertBudget(vertices: number, triangles: number): void {
    if (vertices > MeshModelingTopology.maxVertices || triangles > MeshModelingTopology.maxTriangles)
      throw new Error('Mesh modeling budget exceeded. Reduce Subdivision levels or source detail.')
  }
}
