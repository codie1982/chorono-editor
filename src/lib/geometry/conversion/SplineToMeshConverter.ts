import type { SplinePathData } from '../../types/spline'
import { SplineBoundaryMesh2DGenerator } from '../mesh2d/SplineBoundaryMesh2DGenerator'
import { Mesh2DBoundaryRingExtractor } from '../mesh2d/Mesh2DBoundaryRingExtractor'

/** Authoritative local-pixel Spline → Mesh adapter shared by legacy conversion
 * and registry modifiers. Earcut, topology/area admission and stroke rings stay
 * in their existing geometry owners. Instances are stateless and own no caches. */
export class SplineToMeshConverter {
  /** Preserve curves in source; normalize only Mesh preparation coordinates to
   * 14 significant digits to avoid zero-area trig-roundoff bridges. Maximum
   * deviation in the admitted ±10M px space is below 0.0000005 local px. */
  convert(layerId: string, spline: SplinePathData, tolerancePx: number) {
    const round = (n: number) => Number(n.toPrecision(14))
    const stable = { ...spline,
      points: Object.fromEntries(Object.entries(spline.points).map(([id, p]) => [id, { ...p, x: round(p.x), y: round(p.y) }])),
      handles: Object.fromEntries(Object.entries(spline.handles).map(([id, h]) => [id, { ...h, x: round(h.x), y: round(h.y) }])),
    }
    const mesh = new SplineBoundaryMesh2DGenerator().generate(layerId, stable, { flattenTolerance: tolerancePx })
    return { ...mesh, boundaryRings: new Mesh2DBoundaryRingExtractor().extract(mesh.geometry).map(ring => ring.vertexIndices) }
  }
}
