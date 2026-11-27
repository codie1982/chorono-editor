import type { Layer } from '../types'
import type { Vec2 } from '../geometry/CoordinateSystem'

/** Rigid link between sibling pivots. Bind coordinates are parent-local pixels
 * and degrees at the authoring frame. The layer retains its editable TRS. */
export interface PivotLink2D {
  readonly driverId: string
  readonly bindPivot: Vec2
  readonly bindRotationDeg: number
}

/** Inclusive local geometric angles in clockwise degrees. Bounds may cross 180°
 * or span several turns. A lock retains the authored range for unlocking. */
export interface IKAngleLimit {
  readonly enabled: boolean
  readonly minDeg: number
  readonly maxDeg: number
  readonly lockedDeg?: number
}
export type IKJoint = 'shoulder' | 'elbow'

/** Constraint on the upper layer. tip is a lower-layer-local vector measured
 * from its pivot. Bend selects the side of the root-to-goal line in Y-down space. */
export interface TwoBoneIK2D {
  readonly lowerId: string
  readonly targetId: string
  readonly tip: Vec2
  /** IK influence in [0,1]. Older scenes default to full IK. */
  readonly weight?: number
  readonly bend: 1 | -1
  /** Clockwise offset from the incoming FK upper segment, in degrees. Used
   * when equal-length segments fold onto the root and any heading is valid. */
  readonly preferredShoulderOffsetDeg?: number
  readonly shoulderLimit?: IKAngleLimit
  readonly elbowLimit?: IKAngleLimit
}

/** Drop only relationships whose endpoint is being removed by subtree deletion. */
export function pruneDeletedLinks(layer: Layer, deleted: ReadonlySet<string>): Layer {
  const unlink = layer.pivotLink2d && deleted.has(layer.pivotLink2d.driverId)
  const clear = layer.twoBoneIK2d && (deleted.has(layer.twoBoneIK2d.lowerId) || deleted.has(layer.twoBoneIK2d.targetId))
  if (!unlink && !clear) return layer
  return { ...layer, ...(unlink ? { pivotLink2d: undefined } : {}), ...(clear ? { twoBoneIK2d: undefined } : {}) }
}
