import type { Mesh2DGeometry } from '../../../../types/mesh2d'
import type { MeshSubdivisionSettings, MeshSubdivisionStrategy } from './types'
import { MeshRemeshingSource } from './MeshRemeshingSource'
import { DelaunaySubdivision } from './DelaunaySubdivision'
import { GridSubdivision } from './GridSubdivision'

/** Shared Subdivision workflow with interchangeable algorithms. Delaunay is
 * the default strategy; Grid builds square cells. Bootstrap may supply another
 * implementation through the same contract, without duplicating admission or
 * owning output publication. Instances retain strategies, never job geometry. */
export class MeshSubdivision {
  constructor(private readonly strategies: readonly MeshSubdivisionStrategy[] = [new DelaunaySubdivision(), new GridSubdivision()]) {}
  /** Effective spacing is base cell size / 2^levels, in local px. Level zero is
   * validated identity. Bounds/sites/output have explicit synchronous budgets. */
  subdivide(input: Mesh2DGeometry, settings: MeshSubdivisionSettings, namespace: string): Mesh2DGeometry {
    if (!Number.isInteger(settings.levels) || settings.levels < 0 || settings.levels > 4 || !Number.isFinite(settings.cellSizePx) || settings.cellSizePx < 1 || settings.cellSizePx > 10000)
      throw new Error('Subdivision requires integer levels 0–4 and base cell size 1–10000 local px.')
    const strategy = this.strategies.find(item => item.id === settings.algorithm)
    if (!strategy) throw new Error(`Unknown Subdivision algorithm: ${settings.algorithm}`)
    const source = new MeshRemeshingSource(input)
    return settings.levels ? strategy.generate(source, settings.cellSizePx / 2 ** settings.levels, namespace) : input
  }
}
