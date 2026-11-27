import type { PathDefinition } from '../PathCommand'

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'xor'
/** Immutable job data. Paths and result use the caller-selected planar pixel calculation space,
 * never CSS/screen pixels. Preview uses composition coordinates; persisted
 * recipes use their captured linear sampling space without world translation. No scene IDs or old vertex identities are assigned
 * to the variable-topology result. The caller retains ownership of every input. */
export interface BooleanOperand { label: string; path: PathDefinition; fillRule: 'evenodd' | 'nonzero' }
export interface BooleanRequest {
  operation: BooleanOperation
  operands: readonly BooleanOperand[]
  /** Subtract reverses A minus union(rest) to union(rest) minus A. */
  reverse: boolean
  tolerancePx: number
}
export interface BooleanResult {
  path: PathDefinition
  inputVertices: number
  outputVertices: number
  polygons: number
  holes: number
  tolerancePx: number
}
/** Bounded per-operation workload, independent of zoom/FPS. Limits reject rather than
 * silently simplify geometry. A worker deadline additionally bounds wall time. */
export const BOOLEAN_LIMITS = Object.freeze({ operands: 8, commands: 2048, vertices: 2048, rings: 64, intersections: 4096, outputVertices: 8192 })
/** Narrow orchestration boundary: cancellation rejects and releases the worker.
 * Returned geometry is privately owned; source data is never modified. */
export interface BooleanExecutor { execute(request: BooleanRequest, signal: AbortSignal): Promise<BooleanResult> }
