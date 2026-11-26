import { wrapAngle180, type Vec2 } from '../geometry/CoordinateSystem'
import type { IKAngleLimit, TwoBoneIK2D } from './types'

const radians = Math.PI / 180
const angleEpsilon = 1e-8
type Range = readonly [number, number]
export interface JointAngles { shoulder: number; elbow: number }
export type Bound = 'min' | 'max' | 'locked'

/** Validate portable settings before changing source or evaluating imported joints. */
export function validLimit(limit: IKAngleLimit | undefined): boolean {
  if (limit === undefined) return true
  const finiteAngle = (v: number) => Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER
  return !!limit && typeof limit.enabled === 'boolean' && finiteAngle(limit.minDeg) && finiteAngle(limit.maxDeg)
    && limit.minDeg <= limit.maxDeg && (limit.lockedDeg === undefined ||
      (finiteAngle(limit.lockedDeg) && limit.lockedDeg >= limit.minDeg && limit.lockedDeg <= limit.maxDeg))
}

/** Carry shoulder bounds (including a locked angle) into axes rotated by this
 * clockwise offset. Elbow bounds are relative to the upper segment. */
export function rebaseShoulderLimit(ik: TwoBoneIK2D, degrees: number): TwoBoneIK2D {
  const limit = ik.shoulderLimit
  if (!limit || !degrees) return ik
  return { ...ik, shoulderLimit: { ...limit, minDeg: limit.minDeg + degrees, maxDeg: limit.maxDeg + degrees,
    ...(limit.lockedDeg === undefined ? {} : { lockedDeg: limit.lockedDeg + degrees }) } }
}

/** Disabled bounds allow every angle. Equal endpoints represent a fixed joint. */
function range(limit?: IKAngleLimit): Range | undefined {
  if (!limit?.enabled) return undefined
  return [limit.lockedDeg ?? limit.minDeg, limit.lockedDeg ?? limit.maxDeg]
}

/** Identify a contacted endpoint independently of the target's reach status. */
export function activeBound(value: number, limit?: IKAngleLimit): Bound | undefined {
  const bounds = range(limit)
  if (!bounds) return undefined
  if (bounds[0] === bounds[1]) return 'locked'
  if (Math.abs(value - bounds[0]) <= angleEpsilon) return 'min'
  if (Math.abs(value - bounds[1]) <= angleEpsilon) return 'max'
}

/** Lift a periodic direction to the allowed turn nearest the reference, in O(1). */
function lift(angle: number, bounds: Range | undefined, reference: number): number | undefined {
  let turn = Math.round((reference - angle) / 360)
  if (!bounds) return angle + turn * 360
  const first = Math.ceil((bounds[0] - angle - angleEpsilon) / 360)
  const last = Math.floor((bounds[1] - angle + angleEpsilon) / 360)
  if (first > last) return undefined
  turn = Math.max(first, Math.min(last, turn))
  return Math.max(bounds[0], Math.min(bounds[1], angle + 360 * turn))
}

/** Minimize tip distance in the chain's rigid driver axes, in local pixels.
 * For regular interior optima the tip reaches the target. Other interior optima
 * have collinear segments (singular Jacobian). Each box edge is a circle arc:
 * its nearest point faces the target or is an endpoint. These finite candidates
 * cover locks, unbounded joints and arbitrary turns without angular sampling.
 * Ties prefer the saved elbow side, then the shoulder pose and incoming turns. */
export function solveLimitedAngles(a: number, b: number, target: Vec2, ik: TwoBoneIK2D,
  free: JointAngles, preferredShoulder: number): JointAngles {
  const sr = range(ik.shoulderLimit), er = range(ik.elbowLimit)
  const heading = Math.atan2(target.y, target.x) / radians
  const epsilon = 1e-12 * Math.max(1, a + b)
  let best: JointAngles | undefined, bestGap = Infinity, bestSide = Infinity, bestPreference = Infinity
  const consider = (q1: number, q2: number) => {
    const shoulder = lift(q1, sr, preferredShoulder), elbow = lift(q2, er, free.elbow)
    if (shoulder === undefined || elbow === undefined) return
    const s = (shoulder % 360) * radians, e = (elbow % 360) * radians
    const x = a * Math.cos(s), y = a * Math.sin(s)
    const gap = Math.hypot(target.x - x - b * Math.cos(s + e), target.y - y - b * Math.sin(s + e))
    const cross = target.x * Math.sin(s) - target.y * Math.cos(s)
    const sine = Math.sin(e)
    const side = Math.abs(cross) > epsilon ? Math.sign(cross) : Math.abs(sine) > 1e-12 ? -Math.sign(sine) : 0
    const penalty = Number(side !== 0 && side !== ik.bend)
    const preference = Math.hypot(wrapAngle180(shoulder - preferredShoulder), wrapAngle180(elbow - free.elbow))
    if (gap < bestGap - epsilon || (Math.abs(gap - bestGap) <= epsilon &&
      (penalty < bestSide || (penalty === bestSide && preference < bestPreference)))) {
      best = { shoulder, elbow }; bestGap = gap; bestSide = penalty; bestPreference = preference
    }
  }
  consider(free.shoulder, free.elbow)
  consider(2 * heading - free.shoulder, -free.elbow)
  for (const shoulder of sr ?? []) {
    const s = (shoulder % 360) * radians
    const x = target.x - a * Math.cos(s), y = target.y - a * Math.sin(s)
    consider(shoulder, Math.hypot(x, y) <= epsilon ? free.elbow : Math.atan2(y, x) / radians - shoulder)
    for (const elbow of er ?? []) consider(shoulder, elbow)
  }
  for (const elbow of [0, 180, ...(er ?? [])]) {
    const e = (elbow % 360) * radians, x = a + b * Math.cos(e), y = b * Math.sin(e)
    const anyHeading = Math.hypot(x, y) <= epsilon || Math.hypot(target.x, target.y) <= epsilon
    consider(anyHeading ? preferredShoulder : heading - Math.atan2(y, x) / radians, elbow)
    for (const shoulder of sr ?? []) consider(shoulder, elbow)
  }
  // At least one active finite edge has an optimum, either on its arc or at a corner.
  return best!
}
