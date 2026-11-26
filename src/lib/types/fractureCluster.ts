import type { FracturePoint2D } from './fracture'

/** Authoring values shared by automatically generated fracture bonds. */
export interface FractureBondDefaults {
  /** One-shot contact impulse threshold in solver impulse units. */
  readonly impulseStrength: number
  /** Accumulated scalar damage required to break the bond. */
  readonly damageThreshold: number
  /** Non-healing damage reduction per second; zero disables decay. */
  readonly damageDecayPerSecond: number
  /** Multiplier applied to relative normal contact speed. */
  readonly relativeNormalSpeedScale: number
  /** Seeded per-bond multiplier range around one, from zero to one. */
  readonly variation: number
  readonly seed: number
}

/** Optional authoring override for one unordered fragment pair. */
export interface FractureBondOverride {
  readonly fragmentAId: string
  readonly fragmentBId: string
  /** Removes an automatic bond or creates a non-adjacent manual bond. */
  readonly mode?: 'auto' | 'disabled' | 'manual'
  readonly impulseStrength?: number
  readonly damageThreshold?: number
  readonly damageDecayPerSecond?: number
  readonly relativeNormalSpeedScale?: number
  readonly unbreakable?: boolean
}

/** Portable authored bond between two generation fragments. */
export interface FractureBond {
  readonly bondId: string
  readonly fragmentAId: string
  readonly fragmentBId: string
  readonly origin: 'sharedBoundary' | 'manual'
  /** Zero only for an explicit non-adjacent manual bond. */
  readonly sharedBoundaryLengthPx: number
  /** Source-local representative point used by damage and Canvas diagnostics. */
  readonly sharedBoundaryMidpointPx: FracturePoint2D
  /** Unit source-local normal pointing from fragment A toward fragment B. */
  readonly normalFromAToB: FracturePoint2D
  readonly impulseStrength: number
  readonly damageThreshold: number
  readonly damageDecayPerSecond: number
  readonly relativeNormalSpeedScale: number
  readonly unbreakable: boolean
  readonly initialState: 'intact' | 'broken'
}

/**
 * Immutable FRACTURE2 bond graph derived from one realized generation.
 *
 * Geometry, generated fragment topology and runtime damage remain owned by
 * their respective records. This graph stores only stable fragment links and
 * authoring policy. Runtime solver handles and per-step damage never enter it.
 */
export interface FractureBondGraph {
  readonly schemaVersion: 1
  readonly graphId: string
  readonly generationId: string
  readonly generationTopologyHash: string
  readonly compiler: {
    readonly id: 'shared-boundary-bonds'
    readonly version: 1
  }
  readonly defaults: FractureBondDefaults
  /** Canonical manual/custom policy needed for lossless Re-bake. */
  readonly overrides: readonly FractureBondOverride[]
  readonly fragmentIds: readonly string[]
  readonly bonds: readonly FractureBond[]
  readonly graphHash: string
}

/** One authored, fixed-tick bond break materialized by timeline or user intent. */
export interface FractureBondForcedBreak {
  readonly bondId: string
  /** Simulation-local milliseconds, aligned to the recipe fixed step. */
  readonly timeMs: number
  readonly source: 'timeline' | 'user'
}

/** One authored damage reset; an omitted bond id resets the complete graph. */
export interface FractureBondDamageReset {
  readonly bondId?: string
  /** Simulation-local milliseconds, aligned to the recipe fixed step. */
  readonly timeMs: number
  readonly source: 'timeline' | 'user'
}

/** One intact connected component resolved from a bond graph. */
export interface FractureClusterComponent {
  readonly componentId: string
  readonly fragmentIds: readonly string[]
  readonly intactBondIds: readonly string[]
}
