import type { FragmentGeometry } from '@/lib/types/fracture'
import type { Mesh2DData } from '@/lib/types/mesh2d'
import { FractureRegionClipper } from './FractureRegionClipper'

/**
 * Adapts the shared region clipper to a bake-owned Mesh2D fragment.
 *
 * Authored UV seams and texture reference bounds are preserved. The legacy
 * convex fragment contract requires exactly one connected intersection whose
 * area equals the fragment polygon; complex-source generation consumes the
 * region clipper directly and may retain multiple components.
 */
export class FractureMesh2DClipper {
  constructor(private readonly regionClipper = new FractureRegionClipper()) {}

  /** Returns detached portable fragment data without mutating the source. */
  clip(
    source: Mesh2DData,
    sourceLayerId: string,
    generationId: string,
    fragment: FragmentGeometry,
    sourceAppearanceHash: string,
  ): Mesh2DData {
    const components = this.regionClipper.clip(source.geometry, fragment.polygon, fragment.id)
    const clippedArea = components.reduce((sum, component) => sum + component.areaPx2, 0)
    const tolerance = Math.max(1e-5, fragment.areaPx2 * 1e-7)
    if (components.length !== 1 || Math.abs(clippedArea - fragment.areaPx2) > tolerance) {
      throw new Error(`Fracture Mesh2D clipping does not preserve fragment area (${clippedArea} vs ${fragment.areaPx2})`)
    }
    return Object.freeze({
      schemaVersion: 1,
      source: Object.freeze({
        kind: 'fractureFragment',
        sourceLayerId,
        generationId,
        fragmentId: fragment.id,
        sourceAppearanceHash,
        generatorVersion: 1,
      }),
      geometry: Object.freeze({
        ...components[0].geometry,
        ...(source.geometry.textureReferenceBounds
          ? { textureReferenceBounds: Object.freeze({ ...source.geometry.textureReferenceBounds }) }
          : {}),
      }),
      ...(source.appearance ? { appearance: structuredClone(source.appearance) } : {}),
    })
  }
}
