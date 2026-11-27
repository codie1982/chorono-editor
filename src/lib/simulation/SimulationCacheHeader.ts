/** Serializable identity and coordinate contract shared by simulation clips. */
export interface SimulationCacheHeader<TKind extends string = string> {
  readonly schemaVersion: 1
  readonly kind: TKind
  readonly solverId: string
  readonly solverVersion: string
  readonly sourceHash: string
  readonly recipeHash: string
  readonly coordinateSpace: 'composition-pixels-y-down'
  readonly linearUnit: 'pixel'
  readonly angularUnit: 'degree-unwrapped'
  readonly timeUnit: 'millisecond'
  readonly pixelsPerMeter: number
  readonly stepHz: number
  readonly sampleFps: number
  readonly durationMs: number
}
