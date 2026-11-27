import type { RigidPoseCacheHeader } from '@/lib/types/physics'
import type { RigidPose2D } from './RigidVisualTransform'

/**
 * Immutable-by-ownership dense rigid-pose cache.
 *
 * Values are sample-major then body-major triples `[centerX, centerY, angle]`.
 * Angles remain unwrapped clockwise degrees so linear interpolation preserves
 * complete turns. Constructor input is copied and reads return detached poses.
 */
export class RigidPoseClip {
  readonly header: RigidPoseCacheHeader
  readonly bodyCount: number
  readonly sampleCount: number
  readonly byteLength: number
  private readonly bodyIndex: ReadonlyMap<string, number>
  private readonly times: Float64Array
  private readonly values: Float64Array

  constructor(input: { header: RigidPoseCacheHeader; sampleTimesMs: Float64Array; poses: Float64Array }) {
    const bodyIds = Array.from(input.header.bodyIds)
    if (!bodyIds.length || new Set(bodyIds).size !== bodyIds.length) throw new Error('Rigid pose clip body ids are invalid')
    if (input.header.channels.length !== 3 || input.header.channels[0] !== 'centerX'
      || input.header.channels[1] !== 'centerY' || input.header.channels[2] !== 'angle') {
      throw new Error('Rigid pose clip channel order is unsupported')
    }
    if (input.sampleTimesMs.length < 2) throw new RangeError('Rigid pose clip needs at least two samples')
    let previous = -Infinity
    input.sampleTimesMs.forEach((time, index) => {
      if (!Number.isFinite(time) || time < 0 || (index === 0 ? time !== 0 : time <= previous)) {
        throw new RangeError('Rigid pose sample times must start at zero and increase strictly')
      }
      previous = time
    })
    const expected = input.sampleTimesMs.length * bodyIds.length * 3
    if (input.poses.length !== expected) throw new RangeError('Rigid pose buffer length does not match its manifest')
    input.poses.forEach(value => { if (!Number.isFinite(value)) throw new RangeError('Rigid pose values must be finite') })
    if (input.header.durationMs !== input.sampleTimesMs[input.sampleTimesMs.length - 1]) {
      throw new Error('Rigid pose duration does not match its terminal sample')
    }
    const channels = Object.freeze(['centerX', 'centerY', 'angle'] as const)
    this.header = Object.freeze({ ...input.header, bodyIds: Object.freeze(bodyIds), channels })
    this.bodyCount = bodyIds.length
    this.sampleCount = input.sampleTimesMs.length
    this.bodyIndex = new Map(bodyIds.map((id, index) => [id, index]))
    this.times = input.sampleTimesMs.slice()
    this.values = input.poses.slice()
    this.byteLength = this.times.byteLength + this.values.byteLength
  }

  /** Returns an owned copy of clip-local sample times in milliseconds. */
  sampleTimesMs(): Float64Array { return this.times.slice() }

  /** Returns one exact stored pose by body id and sample index. */
  poseAt(bodyId: string, sampleIndex: number): RigidPose2D {
    const body = this.bodyIndex.get(bodyId)
    if (body === undefined) throw new Error(`Rigid pose body is not available: ${bodyId}`)
    if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0 || sampleIndex >= this.sampleCount) {
      throw new RangeError('Rigid pose sample index is invalid')
    }
    return this.read(sampleIndex, body)
  }

  /** Linearly samples centre and unwrapped angle at clip-local milliseconds. */
  sample(bodyId: string, timeMs: number): RigidPose2D {
    const body = this.bodyIndex.get(bodyId)
    if (body === undefined) throw new Error(`Rigid pose body is not available: ${bodyId}`)
    const time = !Number.isFinite(timeMs) || timeMs <= 0 ? 0 : Math.min(timeMs, this.header.durationMs)
    const upper = this.upperSample(time), lower = Math.max(0, upper - 1)
    if (upper === lower) return this.read(lower, body)
    const start = this.read(lower, body), end = this.read(upper, body)
    const alpha = (time - this.times[lower]) / (this.times[upper] - this.times[lower])
    return {
      centerX: start.centerX + (end.centerX - start.centerX) * alpha,
      centerY: start.centerY + (end.centerY - start.centerY) * alpha,
      angleDeg: start.angleDeg + (end.angleDeg - start.angleDeg) * alpha,
    }
  }

  private read(sample: number, body: number): RigidPose2D {
    const offset = (sample * this.bodyCount + body) * 3
    return { centerX: this.values[offset], centerY: this.values[offset + 1], angleDeg: this.values[offset + 2] }
  }

  private upperSample(timeMs: number): number {
    if (timeMs <= 0) return 0
    if (timeMs >= this.header.durationMs) return this.sampleCount - 1
    let low = 1, high = this.sampleCount - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.times[middle] < timeMs) low = middle + 1
      else high = middle
    }
    return low
  }
}
