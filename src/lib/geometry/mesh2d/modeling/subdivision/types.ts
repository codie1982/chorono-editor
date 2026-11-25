import type { Mesh2DGeometry } from '../../../../types/mesh2d'
import type { MeshRemeshingSource } from './MeshRemeshingSource'
export type SubdivisionAlgorithm = 'delaunay' | 'grid'
export interface MeshSubdivisionSettings { readonly algorithm: SubdivisionAlgorithm; readonly levels: number; readonly cellSizePx: number }
/** Algorithms consume the same validated local region/UV sampler. They return
 * detached, conforming geometry; holes/islands remain material boundaries.
 * UVs are sampled from the source field (affine fields are exact, other
 * continuous fields are interpolated). Explicit discontinuous seams refuse. */
export interface MeshSubdivisionStrategy {
  readonly id: SubdivisionAlgorithm
  generate(source: MeshRemeshingSource, spacingPx: number, namespace: string): Mesh2DGeometry
}
