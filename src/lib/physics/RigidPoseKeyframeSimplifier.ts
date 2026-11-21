import type { RigidBodySnapshot } from '@/lib/types/physics'
import type { RigidPose2D } from './RigidVisualTransform'

const TIME_EPSILON_MS = 1e-7
const ERROR_EPSILON = 1e-9

export interface RigidPoseSample {
  /** Clip-local milliseconds, strictly increasing. */
  readonly timeMs: number
  /** Composition-pixel centre and unwrapped clockwise angle. */
  readonly pose: RigidPose2D
}

export interface RigidPoseSimplificationPolicy {
  readonly maxVertexErrorPx: number
  readonly maxAngleErrorDeg: number
  readonly maxComparisons?: number
}

export interface RigidPoseSimplificationResult {
  readonly samples: readonly RigidPoseSample[]
  readonly rawSampleCount: number
  readonly protectedSampleCount: number
  readonly maxVertexErrorPx: number
  readonly maxAngleErrorDeg: number
}

/**
 * Reduces one body's coupled x/y/unwrapped-angle trajectory.
 *
 * Candidate segments use the same linear time interpolation as generated
 * property tracks. Error is measured at every source sample against the
 * body's world-space collider vertices plus an independent unwrapped angle
 * tolerance. Start/end and caller-supplied event samples are mandatory; the
 * immediate samples around each event are also retained so contact, sleep and
 * topology discontinuities cannot be bridged by one interpolation segment.
 * Instances are stateless and do not mutate the clip or recipe.
 */
export class RigidPoseKeyframeSimplifier {
  /** Returns retained source samples and measured post-simplification errors. */
  simplify(
    body: RigidBodySnapshot,
    samples: readonly RigidPoseSample[],
    protectedTimesMs: readonly number[],
    policy: RigidPoseSimplificationPolicy,
  ): RigidPoseSimplificationResult {
    validateInput(samples, protectedTimesMs, policy)
    if (samples.length <= 2) return result(samples, samples.length, samples.length, 0, 0)
    const vertices = supportVertices(body)
    const keep = new Uint8Array(samples.length)
    keep[0] = 1
    keep[samples.length - 1] = 1
    for (const timeMs of protectedTimesMs) {
      const index = exactTimeIndex(samples, timeMs)
      keep[index] = 1
      if (index > 0) keep[index - 1] = 1
      if (index + 1 < samples.length) keep[index + 1] = 1
    }
    const anchors = indexes(keep)
    const protectedSampleCount = anchors.length
    const budget = { comparisons: 0, limit: policy.maxComparisons ?? 2_000_000 }
    for (let index = 1; index < anchors.length; index++) {
      this.refine(samples, vertices, anchors[index - 1], anchors[index], keep, policy, budget)
    }
    const retained = indexes(keep).map(index => samples[index])
    const errors = verify(samples, retained, vertices)
    if (errors.maxVertexErrorPx > policy.maxVertexErrorPx + ERROR_EPSILON
      || errors.maxAngleErrorDeg > policy.maxAngleErrorDeg + ERROR_EPSILON) {
      throw new Error('Rigid pose simplification exceeded its verified error bounds')
    }
    return result(retained, samples.length, protectedSampleCount, errors.maxVertexErrorPx, errors.maxAngleErrorDeg)
  }

  private refine(
    samples: readonly RigidPoseSample[],
    vertices: readonly Point2D[],
    start: number,
    end: number,
    keep: Uint8Array,
    policy: RigidPoseSimplificationPolicy,
    budget: { comparisons: number; limit: number },
  ): void {
    const stack: Array<readonly [number, number]> = [[start, end]]
    while (stack.length) {
      const [from, to] = stack.pop()!
      if (to - from < 2) continue
      let worstIndex = -1, worstScore = 1
      for (let index = from + 1; index < to; index++) {
        if (++budget.comparisons > budget.limit) {
          throw new Error('Rigid pose simplification work limit exceeded; reduce FPS, duration or body count')
        }
        const predicted = interpolate(samples[from], samples[to], samples[index].timeMs)
        const errors = poseErrors(samples[index].pose, predicted, vertices)
        const score = Math.max(
          normalizedError(errors.vertexPx, policy.maxVertexErrorPx),
          normalizedError(errors.angleDeg, policy.maxAngleErrorDeg),
        )
        if (score > worstScore + ERROR_EPSILON) {
          worstScore = score
          worstIndex = index
        }
      }
      if (worstIndex >= 0) {
        keep[worstIndex] = 1
        stack.push([from, worstIndex], [worstIndex, to])
      }
    }
  }
}

interface Point2D { readonly x: number; readonly y: number }

function supportVertices(body: RigidBodySnapshot): readonly Point2D[] {
  if (body.collider === 'compoundPolygon') {
    if (!body.colliderPartsPx?.length || body.colliderPartsPx.some(part => part.length < 3)) {
      throw new Error(`Compound rigid body ${body.bodyId} has no simplification support vertices`)
    }
    return body.colliderPartsPx.flat()
  }
  if (body.collider === 'convexPolygon') {
    if (!body.colliderVerticesPx || body.colliderVerticesPx.length < 3) {
      throw new Error(`Rigid body ${body.bodyId} has no simplification support vertices`)
    }
    return body.colliderVerticesPx
  }
  const halfWidth = body.widthPx / 2, halfHeight = body.heightPx / 2
  return [
    { x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight },
  ]
}

function interpolate(from: RigidPoseSample, to: RigidPoseSample, timeMs: number): RigidPose2D {
  const alpha = (timeMs - from.timeMs) / (to.timeMs - from.timeMs)
  return {
    centerX: from.pose.centerX + (to.pose.centerX - from.pose.centerX) * alpha,
    centerY: from.pose.centerY + (to.pose.centerY - from.pose.centerY) * alpha,
    angleDeg: from.pose.angleDeg + (to.pose.angleDeg - from.pose.angleDeg) * alpha,
  }
}

function poseErrors(actual: RigidPose2D, predicted: RigidPose2D, vertices: readonly Point2D[]): {
  vertexPx: number; angleDeg: number
} {
  let vertexPx = 0
  for (const vertex of vertices) {
    const actualWorld = worldPoint(actual, vertex), predictedWorld = worldPoint(predicted, vertex)
    vertexPx = Math.max(vertexPx, Math.hypot(actualWorld.x - predictedWorld.x, actualWorld.y - predictedWorld.y))
  }
  return { vertexPx, angleDeg: Math.abs(actual.angleDeg - predicted.angleDeg) }
}

function worldPoint(pose: RigidPose2D, point: Point2D): Point2D {
  const radians = pose.angleDeg * Math.PI / 180
  const cosine = Math.cos(radians), sine = Math.sin(radians)
  return {
    x: pose.centerX + cosine * point.x - sine * point.y,
    y: pose.centerY + sine * point.x + cosine * point.y,
  }
}

function verify(
  samples: readonly RigidPoseSample[],
  retained: readonly RigidPoseSample[],
  vertices: readonly Point2D[],
): { maxVertexErrorPx: number; maxAngleErrorDeg: number } {
  let segment = 1, maxVertexErrorPx = 0, maxAngleErrorDeg = 0
  for (const sample of samples) {
    while (segment < retained.length - 1 && sample.timeMs > retained[segment].timeMs + TIME_EPSILON_MS) segment++
    const from = retained[Math.max(0, segment - 1)], to = retained[segment]
    const predicted = Math.abs(sample.timeMs - from.timeMs) <= TIME_EPSILON_MS
      ? from.pose
      : Math.abs(sample.timeMs - to.timeMs) <= TIME_EPSILON_MS ? to.pose : interpolate(from, to, sample.timeMs)
    const errors = poseErrors(sample.pose, predicted, vertices)
    maxVertexErrorPx = Math.max(maxVertexErrorPx, errors.vertexPx)
    maxAngleErrorDeg = Math.max(maxAngleErrorDeg, errors.angleDeg)
  }
  return { maxVertexErrorPx, maxAngleErrorDeg }
}

function validateInput(
  samples: readonly RigidPoseSample[],
  protectedTimesMs: readonly number[],
  policy: RigidPoseSimplificationPolicy,
): void {
  if (samples.length < 2) throw new RangeError('Rigid pose simplification requires at least two samples')
  let previous = -Infinity
  samples.forEach(sample => {
    if (!Number.isFinite(sample.timeMs) || sample.timeMs <= previous
      || ![sample.pose.centerX, sample.pose.centerY, sample.pose.angleDeg].every(Number.isFinite)) {
      throw new RangeError('Rigid pose simplification samples are invalid')
    }
    previous = sample.timeMs
  })
  if (![policy.maxVertexErrorPx, policy.maxAngleErrorDeg].every(value => Number.isFinite(value) && value >= 0)
    || (policy.maxComparisons !== undefined
      && (!Number.isSafeInteger(policy.maxComparisons) || policy.maxComparisons < 1))) {
    throw new RangeError('Rigid pose simplification policy is invalid')
  }
  protectedTimesMs.forEach(timeMs => {
    if (!Number.isFinite(timeMs) || timeMs < samples[0].timeMs - TIME_EPSILON_MS
      || timeMs > samples[samples.length - 1].timeMs + TIME_EPSILON_MS) {
      throw new RangeError('Rigid pose protected time is outside the clip')
    }
  })
}

function exactTimeIndex(samples: readonly RigidPoseSample[], timeMs: number): number {
  const index = samples.findIndex(sample => Math.abs(sample.timeMs - timeMs) <= TIME_EPSILON_MS)
  if (index < 0) throw new Error(`Rigid pose protected time has no exact sample: ${timeMs}`)
  return index
}

function indexes(keep: Uint8Array): number[] {
  const result: number[] = []
  keep.forEach((value, index) => { if (value) result.push(index) })
  return result
}

function normalizedError(error: number, limit: number): number {
  return limit === 0 ? (error <= ERROR_EPSILON ? 0 : Infinity) : error / limit
}

function result(
  samples: readonly RigidPoseSample[],
  rawSampleCount: number,
  protectedSampleCount: number,
  maxVertexErrorPx: number,
  maxAngleErrorDeg: number,
): RigidPoseSimplificationResult {
  return Object.freeze({
    samples: Object.freeze([...samples]),
    rawSampleCount,
    protectedSampleCount,
    maxVertexErrorPx,
    maxAngleErrorDeg,
  })
}
