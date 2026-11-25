import type { Mesh2DGeometry } from '../../../types/mesh2d'
import { computeMesh2DLocalBounds } from '../Mesh2DGeometryQueries'
import type { Mesh2DAdjacency } from '../Mesh2DAdjacencyBuilder'
import { MeshBoundaryMotionGuard } from './MeshBoundaryMotionGuard'
import { MeshModelingTopology } from './MeshModelingTopology'

export interface MeshSmoothingSettings {
  readonly strength: number
  readonly iterations: number
  readonly preserveBoundary: boolean
}
/** Uniform relaxed Laplacian smoothing with simultaneous (Jacobi) updates.
 * Each interior vertex moves strength × (neighbor mean − position). Boundary
 * vertices either stay fixed or use only their two boundary neighbors, so holes
 * and islands never acquire synthetic cross-boundary neighbors. UVs/connectivity
 * and stable IDs are unchanged; texture reference bounds keep their rest-space
 * meaning. Inversion/degeneracy fails instead of silently reducing strength.
 * Boundary motion can shrink outlines; this is not area-preserving smoothing.
 * Stateless O(iterations × (V+E+F)), with a bounded neighbor-work admission.
 * Uniform weighting reference: https://www.graphics.rwth-aachen.de/media/openmesh_static/Documentations/OpenMesh-8.1-Documentation/a00656_source.html
 */
export class LaplacianMeshSmoother {
  /** Return detached changed positions in local px; source is never mutated.
   * Strength 0–1, iterations 1–50. Zero strength returns the validated input. */
  smooth(input: Mesh2DGeometry, settings: MeshSmoothingSettings): Mesh2DGeometry {
    const { strength, iterations, preserveBoundary } = settings
    if (!Number.isFinite(strength) || strength < 0 || strength > 1 || !Number.isInteger(iterations) || iterations < 1 || iterations > 50 || typeof preserveBoundary !== 'boolean')
      throw new Error('Smooth requires strength 0–1, integer iterations 1–50 and a boundary policy.')
    const adjacency = new MeshModelingTopology().prepare(input)
    if (strength === 0) return input
    if (adjacency.edges.length * 2 * iterations > 8000000) throw new Error('Smooth workload limit exceeded. Reduce iterations or Subdivision levels.')
    const boundary = preserveBoundary ? undefined : new MeshBoundaryMotionGuard(input, adjacency.boundaryEdges.length)
    const neighbors = this.neighbors(adjacency, preserveBoundary)
    let positions: readonly number[] = input.positions
    for (let pass = 0; pass < iterations; pass++) {
      const next = [...positions]
      neighbors.forEach((ids, vertex) => {
        if (!ids.length) return
        for (let component = 0; component < 2; component++) {
          const offset = vertex * 2 + component, value = positions[offset]
          const mean = ids.reduce((sum, id) => sum + positions[id * 2 + component] / ids.length, 0)
          next[offset] = (1 - strength) * value + strength * mean
        }
      })
      this.assertPositiveTriangles(input, next)
      positions = next
    }
    boundary?.assert(positions)
    return { ...input, positions,
      textureReferenceBounds: input.textureReferenceBounds ?? computeMesh2DLocalBounds(input) ?? undefined }
  }
  /** Preserve isolated vertices; boundary adjacency is independent of diagonals. */
  private neighbors(adjacency: Mesh2DAdjacency, preserve: boolean): readonly (readonly number[])[] {
    const boundary = new Map<number, number[]>()
    adjacency.boundaryEdges.forEach(({ vertices: [a, b] }) => {
      boundary.set(a, [...(boundary.get(a) ?? []), b]); boundary.set(b, [...(boundary.get(b) ?? []), a])
    })
    return adjacency.vertexNeighbors.map((ids, vertex) => boundary.has(vertex) ? preserve ? [] : boundary.get(vertex)! : ids)
  }
  /** Keep the existing validator's 1e-8 local-px² signed-double-area threshold.
   * Connectivity is unchanged, so this O(F) check avoids rebuilding adjacency on
   * every iteration. The full shared validator admits the final stack output. */
  private assertPositiveTriangles(input: Mesh2DGeometry, positions: readonly number[]): void {
    const faces = input.topology.triangleIndices
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i] * 2, b = faces[i + 1] * 2, c = faces[i + 2] * 2
      const area = (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) - (positions[b + 1] - positions[a + 1]) * (positions[c] - positions[a])
      if (!Number.isFinite(area) || area <= 1e-8) throw new Error('Smooth would fold or collapse a triangle. Reduce strength or iterations.')
    }
  }
}
