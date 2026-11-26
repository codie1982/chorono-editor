import type { Layer } from '../types'
import { activeBound, solveLimitedAngles } from './jointLimits'
import type { LocalIKDiagnostic } from './diagnostics'
import { distance, wrapAngle180, type Vec2 } from '../geometry/CoordinateSystem'
import { getLayerValue, type OverrideMap } from '../evaluator'
import { Matrix2D } from '../geometry/Matrix2D'
import type { PivotLink2D, TwoBoneIK2D } from './types'

/** Pivot in common parent space, artwork rotation in degrees and local scale. */
export interface JointPose { pivot: Vec2; angle: number; sx: number; sy: number }

export const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const rotate = (v: Vec2, degrees: number): Vec2 => Matrix2D.rotation(degrees).applyToVector(v)
const angle = (v: Vec2) => Math.atan2(v.y, v.x) * 180 / Math.PI
export const length = (v: Vec2) => Math.hypot(v.x, v.y)

/** Read authored/animated TRS using the renderer's T(position + anchor) convention. */
export function readJoint(layer: Layer, frame: OverrideMap): JointPose {
  const value = (key: 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotationDeg' | 'anchorX' | 'anchorY') =>
    getLayerValue(frame, layer.id, 'transform.' + key, layer.transform[key])
  return { pivot: { x: value('x') + value('anchorX'), y: value('y') + value('anchorY') },
    angle: value('rotationDeg'), sx: value('scaleX'), sy: value('scaleY') }
}

/** Compose driver translation/rotation since binding with the follower's
 * animated pose. Scaling the artwork leaves pivot-to-pivot spacing intact. */
export function followPivot(source: JointPose, driver: JointPose, link: PivotLink2D): JointPose {
  const delta = driver.angle - link.bindRotationDeg
  const offset = rotate(subtract(source.pivot, link.bindPivot), delta)
  return { ...source, pivot: { x: driver.pivot.x + offset.x, y: driver.pivot.y + offset.y }, angle: source.angle + delta }
}

/** Analytic two-link circle intersection in parent-local pixels. Reach clamps
 * to [|a-b|, a+b]. At the root, the FK first segment supplies a deterministic
 * direction unless an equal-length chain has a saved shoulder offset. Enabled
 * bounds minimize wrist error in the driver axes (referenceDeg). Artwork-to-bone
 * offsets and authored turns are retained. Blend shoulder and relative elbow
 * on their nearest angular branches, then reconstruct both rigid segments.
 * Diagnostics measure the displayed tip. Zero-length segments return FK. */
export function solveTwoBone(root: JointPose, lower: JointPose, target: Vec2, ik: TwoBoneIK2D, referenceDeg = 0, weight = ik.weight ?? 1):
  { upper: JointPose; lower: JointPose; diagnostic: LocalIKDiagnostic } {
  const first = subtract(lower.pivot, root.pivot), reach = subtract(target, root.pivot)
  const tip = { x: lower.sx * ik.tip.x, y: lower.sy * ik.tip.y }
  const a = length(first), b = length(tip), d = length(reach)
  if (Math.min(a, b) < 1e-8) return { upper: root, lower, diagnostic: { status: 'inactive', reason: 'zero-length' } }
  const inner = Math.abs(a - b), outer = a + b
  // A tip reconstructed by FK can land a few ulps inside a tangent circle.
  // Snap that numerical residue before acos amplifies it into a false elbow bend.
  const epsilon = Math.min(8 * Number.EPSILON * outer, (outer - inner) / 4)
  const radius = d >= outer - epsilon ? outer : d <= inner + epsilon ? inner : d
  const fkHeading = angle(first)
  const heading = d < 1e-8 ? fkHeading : angle(reach)
  const boundary = radius >= 1e-8 && (radius === outer || radius === inner)
  const backwardUpper = radius === inner && b > a
  const backwardLower = radius === inner && a > b
  let theta: number
  if (radius < 1e-8) {
    theta = fkHeading + (ik.preferredShoulderOffsetDeg ?? 0)
  } else if (boundary) {
    // Both branches coincide. An exact boundary avoids spurious tiny bends.
    theta = heading + (backwardUpper ? 180 * ik.bend : 0)
  } else {
    // Factoring a² − b² retains precision for nearly equal folded segments.
    const cos = ((a - b) * outer + radius * radius) / (2 * a * radius)
    theta = heading + ik.bend * Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
  }
  const joint = rotate({ x: a, y: 0 }, theta)
  const end = rotate({ x: radius, y: 0 }, heading)
  // At an antipodal angle either ±180 represents the same artwork. Take the
  // representative approached from inside the reach interval for this bend.
  let shoulderOffsetDeg = jointRotationOffset(theta - fkHeading, boundary, backwardUpper ? ik.bend : -ik.bend)
  const upperPose = { ...root, angle: root.angle + shoulderOffsetDeg }
  const lowerHeading = angle(subtract(end, joint)) - angle(tip)
  const lowerPose = { ...lower, pivot: { x: root.pivot.x + joint.x, y: root.pivot.y + joint.y },
    angle: lower.angle + jointRotationOffset(lowerHeading - (lower.angle % 360), boundary, backwardLower ? -ik.bend : ik.bend) }
  const fkAbsolute = root.angle + wrapAngle180(fkHeading - (root.angle % 360))
  const freeShoulder = fkAbsolute + shoulderOffsetDeg - referenceDeg
  let angles = { shoulder: freeShoulder, elbow: lowerPose.angle + angle(tip) - (referenceDeg + freeShoulder) }
  const constrained = !!(ik.shoulderLimit?.enabled || ik.elbowLimit?.enabled)
  if (constrained) {
    const preferred = ik.preferredShoulderOffsetDeg === undefined ? freeShoulder
      : fkAbsolute - referenceDeg + ik.preferredShoulderOffsetDeg
    angles = solveLimitedAngles(a, b, rotate(reach, -referenceDeg), ik, angles, preferred)
    const upperHeading = referenceDeg + angles.shoulder
    const vector = rotate({ x: a, y: 0 }, upperHeading % 360)
    upperPose.angle = root.angle + (upperHeading - fkAbsolute)
    lowerPose.pivot = { x: root.pivot.x + vector.x, y: root.pivot.y + vector.y }
    lowerPose.angle = upperHeading + angles.elbow - angle(tip)
    shoulderOffsetDeg = wrapAngle180(upperHeading - fkAbsolute)
  }
  if (weight < 1) {
    const fkShoulder = fkAbsolute - referenceDeg
    const fkElbow = lower.angle + angle(tip) - fkAbsolute
    const shoulderDelta = weight * wrapAngle180(angles.shoulder - fkShoulder)
    const elbowDelta = weight * wrapAngle180(angles.elbow - fkElbow)
    angles = { shoulder: fkShoulder + shoulderDelta, elbow: fkElbow + elbowDelta }
    shoulderOffsetDeg = shoulderDelta
    upperPose.angle = root.angle + shoulderDelta
    const arm = rotate(first, shoulderDelta)
    lowerPose.pivot = weight === 0 ? lower.pivot : { x: root.pivot.x + arm.x, y: root.pivot.y + arm.y }
    lowerPose.angle = lower.angle + shoulderDelta + elbowDelta
  }
  // Measure the actual artwork tip from the solved pose against the original goal.
  const offset = rotate(tip, lowerPose.angle)
  const actual = { x: lowerPose.pivot.x + offset.x, y: lowerPose.pivot.y + offset.y }
  const error = distance(actual, target)
  const tolerance = Math.max(0.0001 * outer, 0.001)
  const reached = error <= tolerance
  const limited = constrained && error > Math.abs(d - radius) + 1e-10 * outer
  const solvedUpper = subtract(lowerPose.pivot, root.pivot)
  const side = reach.x * solvedUpper.y - reach.y * solvedUpper.x
  return { upper: upperPose, lower: lowerPose, diagnostic: {
    weight, status: reached ? 'reached' : weight < 1 ? 'blended' : limited ? 'limited' : d > a + b ? 'extended' : 'folded',
    shoulderOffsetDeg, angles, referenceDeg,
    shoulderBound: activeBound(angles.shoulder, ik.shoulderLimit), elbowBound: activeBound(angles.elbow, ik.elbowLimit),
    alternateBend: constrained && side * ik.bend < -1e-10 * a * d,
    local: { shoulder: root.pivot, elbow: lowerPose.pivot, tip: actual, target, distance: error },
  } }
}

/** Select a signed half-turn at a tangent where atan2 can return either side
 * of its cut. Other angles retain their nearest equivalent on the FK turn. */
function jointRotationOffset(delta: number, boundary: boolean, halfTurnSign: number): number {
  const offset = wrapAngle180(delta)
  return boundary && Math.abs(Math.abs(offset) - 180) < 1e-10 ? halfTurnSign * 180 : offset
}
