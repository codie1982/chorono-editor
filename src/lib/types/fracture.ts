import type { Mesh2DGeometry } from './mesh2d'

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

/**
 * Appearance provenance captured with a prepared fracture recipe.
 *
 * The content hash covers the supported source appearance and the image
 * asset's persisted dimensions where applicable. Runtime decoded media is not
 * retained. Older fracture recipes may omit this additive record and continue
 * to use the historical solid-path output behavior.
 */
export type FractureAppearanceSnapshot =
  | {
    readonly schemaVersion: 1
    readonly kind: 'solid'
    readonly sourceLayerId: string
    readonly contentHash: string
  }
  | {
    readonly schemaVersion: 1
    readonly kind: 'image'
    readonly sourceLayerId: string
    readonly contentHash: string
    readonly assetId: string
    readonly assetWidth: number
    readonly assetHeight: number
    readonly objectFit: 'fill' | 'contain' | 'cover' | 'none'
  }
  | {
    readonly schemaVersion: 1
    readonly kind: 'mesh2d'
    readonly sourceLayerId: string
    /** Covers portable geometry, UVs, appearance, style and blend inputs. */
    readonly contentHash: string
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
    /** V2 emits scene-portable fragment/seed ids; V1 remains readable. */
    readonly compilerVersion: 1 | 2
  }
  readonly seeds: readonly FractureSeedPoint[]
  readonly fragments: readonly FragmentGeometry[]
  readonly topologyHash: string
}

/** One normalized outer or hole boundary retained by a FRACTURE1 manifest. */
export interface FractureRegionRingGeometry {
  readonly points: readonly FracturePoint2D[]
  readonly signedDoubleArea: number
  readonly parentIndex: number | null
  readonly depth: number
  readonly role: 'outer' | 'hole'
}

/** Portable complex source snapshot used by FRACTURE1 generation. */
export interface FractureRegionSourceGeometry {
  readonly ownerId: string
  /** Covers source positions, UVs and topology, not only its outer boundary. */
  readonly revision: string
  readonly topologyHash: string
  readonly rings: readonly FractureRegionRingGeometry[]
  readonly areaPx2: number
  readonly boundsPx: FractureBounds2D
}

/**
 * One edge-connected FRACTURE1 fragment.
 *
 * A Voronoi cell may produce multiple records when a source hole or concavity
 * disconnects its intersection. Render geometry retains interpolated UVs;
 * collider parts are non-overlapping convex polygons in the same source-local
 * pixel space. `containsSeed` identifies the component that owns the realized
 * cell seed without pretending every disconnected component contains it.
 */
export interface FractureRegionFragmentGeometry {
  readonly id: string
  readonly seedId: string
  readonly cellIndex: number
  readonly componentIndex: number
  readonly containsSeed: boolean
  readonly geometry: Mesh2DGeometry
  readonly colliderParts: readonly (readonly FracturePoint2D[])[]
  readonly boundaryRings: readonly FractureRegionRingGeometry[]
  readonly centroidPx: FracturePoint2D
  readonly areaPx2: number
  readonly boundsPx: FractureBounds2D
}

/** Shared non-zero boundary between two generated fragments. */
export interface FractureFragmentAdjacency {
  readonly fragmentAId: string
  readonly fragmentBId: string
  readonly sharedLengthPx: number
}

/**
 * Portable FRACTURE1 generation for concave, holed or disconnected sources.
 *
 * Realized render topology and collider decomposition are stored because
 * triangulation, clipping and Voronoi library versions are not cross-version
 * reconstruction guarantees. Runtime solver handles remain outside scene JSON.
 */
export interface FractureRegionGeneration {
  readonly schemaVersion: 2
  readonly generationId: string
  readonly generationIndex: 0
  readonly parentId: string
  readonly rootSeed: number
  readonly generationAttempt: number
  /** Requested Voronoi cell count; realized fragments may be greater. */
  readonly requestedFragmentCount: number
  readonly source: FractureRegionSourceGeometry
  readonly algorithm: {
    readonly id: 'd3-delaunay-region'
    readonly version: '6.0.4'
    readonly compilerVersion: 1
  }
  readonly seeds: readonly FractureSeedPoint[]
  readonly fragments: readonly FractureRegionFragmentGeometry[]
  readonly adjacency: readonly FractureFragmentAdjacency[]
  readonly topologyHash: string
}

/** Every portable first-generation fracture manifest accepted by the scene. */
export type AnyFractureGeneration = FractureGeneration | FractureRegionGeneration
