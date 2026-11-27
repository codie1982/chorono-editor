import type { Vec2 } from '../geometry/CoordinateSystem'

import type { JointAngles, Bound } from './jointLimits'
import type { Matrix2D } from '../geometry/Matrix2D'

/** Solved points and distance in one coordinate system, measured in pixels. */
export interface IKMeasurement {
  readonly shoulder: Vec2
  readonly elbow: Vec2
  readonly tip: Vec2
  readonly target: Vec2
  readonly distance: number
}

export type IKReach = 'reached' | 'extended' | 'folded' | 'limited' | 'blended'
export type IKFailure = 'zero-length' | 'singular-parent' | 'invalid-binding' | 'dependency-cycle'
/** Signed rotation from the FK upper segment in shared parent axes at this frame. */
interface SolvedIK {
  weight: number
  status: IKReach
  local: IKMeasurement
  shoulderOffsetDeg: number
  angles: JointAngles
  referenceDeg: number
  shoulderBound?: Bound
  elbowBound?: Bound
  alternateBend: boolean
}
export type LocalIKDiagnostic =
  | SolvedIK
  | { status: 'inactive'; reason: IKFailure }

/** A transient per-chain measurement. Reach classification uses parent-local
 * distance. Composition points include all evaluated ancestors, before zoom. */
export type IKDiagnostic = { upperId: string; lowerId: string; targetId: string } & (
  | (SolvedIK & { composition: IKMeasurement; parentBasis?: Pick<Matrix2D, 'a' | 'b' | 'c' | 'd'> })
  | { status: 'inactive'; reason: IKFailure }
)
export type IKDiagnostics = ReadonlyMap<string, IKDiagnostic>
export const EMPTY_IK_DIAGNOSTICS: IKDiagnostics = new Map()

/** Select each related chain once, including every chain sharing a target. */
export function selectedIKDiagnostics(frame: IKDiagnostics, ids: ReadonlySet<string>): IKDiagnostic[] {
  return Array.from(frame.values()).filter(chain =>
    ids.has(chain.upperId) || ids.has(chain.lowerId) || ids.has(chain.targetId))
}
