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

/**
 * Bake-owned Mesh2D source for one image-backed fracture fragment.
 *
 * Positions remain in the original source layer's local coordinates while
 * UVs address the full source rectangle. The appearance hash identifies the
 * exact image placement inherited at prepare time. Editing this generated
 * layer is allowed, but bake ownership will then report it as modified.
 */
export interface FractureFragmentMesh2DSource {
  readonly kind: 'fractureFragment'
  readonly sourceLayerId: string
  readonly generationId: string
  readonly fragmentId: string
  readonly sourceAppearanceHash: string
  readonly generatorVersion: 1
}

/** Geometry-owned snapshot after modeling or Bake. The original generator
 * belongs to Layer.modifierStack.source, never a misleading regeneration link
 * on the derived mesh. Portable runtime consumes geometry directly. */
export interface AuthoredMesh2DSource {
  readonly kind: 'authored'
  readonly schemaVersion: 1
}

/** Persisted source recipes supported by the 2D mesh subsystem. */
export type Mesh2DSource = StructuredGridMesh2DSource | SplineBoundaryMesh2DSource
  | ShapeBoundaryMesh2DSource | FractureFragmentMesh2DSource | AuthoredMesh2DSource

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
  /** Optional full Grid cells in positive cyclic order, grouped by four.
   * Each quad is backed by renderer triangles (a,b,c) and (a,c,d). Boundary
   * transition faces remain triangles; missing preserves legacy topology. */
  readonly quadIndices?: readonly number[]
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
  /**
   * Local rectangle addressed by normalized UVs before texture placement.
   * Absence preserves the historical contract where the geometry bounds are
   * the UV reference. Fracture fragments use the complete source rectangle so
   * independently moving pieces continue sampling their original pixels.
   */
  readonly textureReferenceBounds?: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

/** Ways a texture's source rectangle can be fitted into Mesh2D local bounds. */
export type Mesh2DTextureFit = 'stretch' | 'contain' | 'cover' | 'fitX' | 'fitY' | 'original'

/**
 * Portable, topology-independent placement of a Mesh2D texture.
 *
 * Offsets use layer-local composition pixels. Scale is dimensionless and must
 * stay positive; reflections are represented by the explicit flip flags so
 * scale handles and serialization have one unambiguous meaning. Rotation is
 * clockwise in Chorono's x-right/y-down screen convention. The pivot is stored
 * in normalized source-image coordinates and therefore survives asset-size and
 * mesh-resolution changes.
 */
export interface Mesh2DTextureTransform {
  readonly schemaVersion: 1
  readonly fit: Mesh2DTextureFit
  readonly offsetX: number
  readonly offsetY: number
  readonly scaleX: number
  readonly scaleY: number
  readonly rotationDeg: number
  readonly pivotU: number
  readonly pivotV: number
  readonly flipX: boolean
  readonly flipY: boolean
}

/**
 * Portable appearance reference for one fixed-topology mesh.
 *
 * The image bytes remain owned by the scene asset registry. UV coordinates are
 * read from `Mesh2DGeometry`; sampling is a renderer hint and never changes
 * topology or source generation. A missing/undecoded asset must use the
 * renderer's explicit solid-fill fallback rather than pretending the texture
 * rendered successfully.
 */
export interface Mesh2DAppearance {
  readonly schemaVersion: 1
  readonly kind: 'solid' | 'texture'
  readonly textureAssetId?: string
  readonly sampling: 'linear' | 'nearest'
  /** Missing on legacy scenes; absence is exactly the historical stretch fit. */
  readonly textureTransform?: Mesh2DTextureTransform
}

/**
 * Small authoring record for cloth/deformation pin selection.
 *
 * Pins address stable topology vertex ids, never array offsets. The captured
 * topology hash makes regeneration invalidation explicit: callers may keep a
 * stale selection for diagnosis, but solvers must not silently remap it.
 */
export interface Mesh2DPinSelection {
  readonly schemaVersion: 1
  readonly topologyHash: string
  readonly vertexIds: readonly string[]
}

/**
 * Portable playback reference to a binary `meshDeformation` asset.
 *
 * Times are composition milliseconds. `startTimeMs` maps composition time to
 * clip-local zero; playback rate is a dimensionless positive multiplier. Dense
 * samples and typed arrays stay in the referenced asset, outside scene JSON.
 */
export interface Mesh2DDeformationBinding {
  readonly schemaVersion: 1
  readonly assetId: string
  readonly startTimeMs: number
  readonly playbackRate: number
  readonly loop: boolean
}

/** Versioned source payload stored by a future `mesh2d` layer. */
export interface Mesh2DData {
  /** Optional exterior/hole loops addressing topology vertices. Conversion
   * uses these to paint stroke/trim against current (including deformed)
   * positions without stroking internal triangle edges. */
  readonly boundaryRings?: readonly (readonly number[])[]
  readonly schemaVersion: 1
  readonly source: Mesh2DSource
  readonly geometry: Mesh2DGeometry
  readonly appearance?: Mesh2DAppearance
  readonly pins?: Mesh2DPinSelection
  readonly deformation?: Mesh2DDeformationBinding
}
