/**
 * Chooses the stable diagonal used to turn each structured-grid quad into two
 * renderer/solver triangles. The value is persisted because changing it alters
 * connectivity even when the vertex positions remain unchanged.
 */
export type Mesh2DGridDiagonal = 'topLeftToBottomRight' | 'topRightToBottomLeft'

/**
 * Serializable source recipe for the first Mesh2D generator.
 *
 * `columns` and `rows` are cell counts, so the resulting vertex dimensions are
 * `(columns + 1) × (rows + 1)`. Width and height use layer-local composition
 * pixels. The generator version makes future algorithm changes explicit.
 */
export interface StructuredGridMesh2DSource {
  readonly kind: 'structuredGrid'
  readonly width: number
  readonly height: number
  readonly columns: number
  readonly rows: number
  readonly diagonal: Mesh2DGridDiagonal
  readonly generatorVersion: 1
}

/**
 * Serializable recipe for a Mesh2D derived from closed spline boundaries.
 *
 * The spline remains an independent scene layer. `sourceFingerprint` records
 * the exact flattened boundary used for this mesh so authoring UI and future
 * bake consumers can detect stale derived geometry without storing runtime
 * objects in scene JSON. Flatten tolerance is expressed in source-layer local
 * pixels and therefore never changes with viewport zoom.
 */
export interface SplineBoundaryMesh2DSource {
  readonly kind: 'splineBoundary'
  readonly sourceLayerId: string
  readonly sourceFingerprint: string
  readonly flattenTolerance: number
  readonly uvFit: 'bounds'
  readonly triangulation: {
    readonly algorithm: 'earcut'
    readonly algorithmVersion: '3.2.4'
  }
  readonly generatorVersion: 1
}

/**
 * Serializable recipe for a Mesh2D derived from a closed parametric shape.
 *
 * The shape layer remains authoritative and editable. Its current size,
 * parameters and corner radius are converted through the shared shape-path
 * contract before entering the same validated boundary triangulation used by
 * splines. The fingerprint therefore detects every geometry-affecting edit.
 */
export interface ShapeBoundaryMesh2DSource {
  readonly kind: 'shapeBoundary'
  readonly sourceLayerId: string
  readonly sourceFingerprint: string
  readonly flattenTolerance: number
  readonly uvFit: 'bounds'
  readonly triangulation: {
    readonly algorithm: 'earcut'
    readonly algorithmVersion: '3.2.4'
  }
  readonly generatorVersion: 1
}

/** Persisted source recipes supported by the 2D mesh subsystem. */
export type Mesh2DSource = StructuredGridMesh2DSource | SplineBoundaryMesh2DSource | ShapeBoundaryMesh2DSource

/**
 * Fixed connectivity for a Mesh2D source.
 *
 * Triangle indices address `Mesh2DGeometry.positions` and use positive signed
 * area in Chorono's layer-local x-right/y-down coordinate system. Arrays remain
 * ordinary JSON-compatible values in portable source data; runtime adapters may
 * compile them into typed buffers without mutating this record.
 */
export interface Mesh2DTopology {
  readonly schemaVersion: 1
  readonly vertexIds: readonly string[]
  readonly triangleIndices: readonly number[]
  /** Non-cryptographic deterministic change detector for connectivity. */
  readonly topologyHash: string
}

/**
 * Serializable, fixed-topology Mesh2D geometry.
 *
 * Positions and UVs are interleaved `[x0, y0, x1, y1, …]` and
 * `[u0, v0, u1, v1, …]`. UV coordinates are normalized to `[0, 1]` by the
 * structured-grid generator. Solver rest state, deformation samples and GPU
 * resources deliberately live outside this source record.
 */
export interface Mesh2DGeometry {
  readonly positions: readonly number[]
  readonly uvs: readonly number[]
  readonly topology: Mesh2DTopology
}

/** Versioned source payload stored by a future `mesh2d` layer. */
export interface Mesh2DData {
  readonly schemaVersion: 1
  readonly source: Mesh2DSource
  readonly geometry: Mesh2DGeometry
}
