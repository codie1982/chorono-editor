import type { BooleanOperation } from '../geometry/boolean/types'

/** Serializable v1 recipe on a normal group. Inputs are protected direct
 * children; resultLayerId names its generated spline child. SubShape IDs remain
 * scoped to their original layer. No evaluated paths/buffers enter this record.
 * Sampling is an invertible owner-local → calculation-space linear matrix,
 * captured at Apply so curve tolerance is reproducible after save/load, clone
 * and later outer transforms. Coordinates are pixels, time is composition ms. */
export interface BooleanOperationData {
  version: 1
  operation: BooleanOperation
  reverse: boolean
  tolerancePx: number
  sampling: [number, number, number, number]
  inputs: Array<{ layerId: string; subShapeId?: string }>
  resultLayerId: string
}
