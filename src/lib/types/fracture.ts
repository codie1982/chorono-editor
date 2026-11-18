/** One finite point in source-layer local pixels. */
export interface FracturePoint2D {
  readonly x: number
  readonly y: number
}

/** Axis-aligned source-local bounds in pixels. */
export interface FractureBounds2D {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** Realized deterministic Voronoi seed retained with portable geometry. */
export interface FractureSeedPoint extends FracturePoint2D {
  readonly id: string
}

/**
 * One fixed-topology convex fragment in source-layer local coordinates.
 *
 * Polygon vertices never repeat the closing vertex and use positive signed
 * area in Chorono's y-down coordinate system. The centroid is the physical
 * centre of mass for a uniform-density fragment. Runtime solver handles and
 * per-frame poses do not belong to this record.
 */
export interface FragmentGeometry {
  readonly id: string
  readonly seedId: string
  readonly polygon: readonly FracturePoint2D[]
  readonly centroidPx: FracturePoint2D
  readonly areaPx2: number
  readonly boundsPx: FractureBounds2D
}

/** Immutable source snapshot used to validate and reproduce one generation. */
export interface FractureSourceGeometry {
  readonly ownerId: string
  readonly revision: string
  readonly polygon: readonly FracturePoint2D[]
  readonly areaPx2: number
  readonly boundsPx: FractureBounds2D
}

/**
 * Portable result of one Voronoi topology generation.
 *
 * Realized seeds and polygons are persisted because seed plus library version
 * alone is not a cross-version geometry guarantee. This foundation represents
 * generation zero only; parent/child lineage and recursive destruction extend
 * the contract in a later version.
 */
export interface FractureGeneration {
  readonly schemaVersion: 1
  readonly generationId: string
  readonly generationIndex: 0
  readonly parentId: string
  readonly rootSeed: number
  readonly generationAttempt: number
  readonly requestedFragmentCount: number
  readonly source: FractureSourceGeometry
  readonly algorithm: {
    readonly id: 'd3-delaunay'
    readonly version: '6.0.4'
    readonly compilerVersion: 1
  }
  readonly seeds: readonly FractureSeedPoint[]
  readonly fragments: readonly FragmentGeometry[]
  readonly topologyHash: string
}
