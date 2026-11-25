export interface MeshDeformationClipInput {
  readonly topologyHash: string
  readonly vertexCount: number
  readonly componentCount: 2 | 3
  readonly sampleTimesMs: Float64Array
  readonly positions: Float32Array
  readonly solverVersion?: string
  readonly sourceRecipeHash?: string
}

/**
 * Immutable-by-ownership runtime view of one fixed-topology deformation clip.
 *
 * The instance owns its typed buffers and never exposes them for mutation.
 * Sample times must be finite, strictly increasing local milliseconds starting
 * at zero. Positions are layer-local pixels (x/y, optional z) in sample-major,
 * vertex-major order. Sampling linearly interpolates x/y and ignores z for the
 * 2D renderer. Instances hold mutable scratch only when a caller supplies it;
 * no state is shared between clips.
 */
export class MeshDeformationClip {
  readonly schemaVersion = 1 as const
  readonly topologyHash: string
  readonly vertexCount: number
  readonly componentCount: 2 | 3
  readonly solverVersion?: string
  readonly sourceRecipeHash?: string
  readonly sampleCount: number
  readonly durationMs: number
  readonly byteLength: number
  private readonly sampleTimesMsBuffer: Float64Array
  private readonly positionsBuffer: Float32Array

  constructor(input: MeshDeformationClipInput) {
    if (!input.topologyHash) throw new Error('Mesh deformation topology hash is required')
    if (!Number.isSafeInteger(input.vertexCount) || input.vertexCount < 1) throw new RangeError('Mesh deformation vertex count is invalid')
    if (input.componentCount !== 2 && input.componentCount !== 3) throw new RangeError('Mesh deformation component count must be 2 or 3')
    if (input.sampleTimesMs.length < 1) throw new RangeError('Mesh deformation needs at least one sample')
    let previous = -Infinity
    input.sampleTimesMs.forEach((time, index) => {
      if (!Number.isFinite(time) || time < 0 || (index === 0 ? time !== 0 : time <= previous)) {
        throw new RangeError('Mesh deformation sample times must start at zero and increase strictly')
      }
      previous = time
    })
    const expected = input.sampleTimesMs.length * input.vertexCount * input.componentCount
    if (input.positions.length !== expected) throw new RangeError('Mesh deformation position buffer length does not match its header')
    input.positions.forEach(value => {
      if (!Number.isFinite(value)) throw new RangeError('Mesh deformation positions must be finite')
    })
    this.topologyHash = input.topologyHash
    this.vertexCount = input.vertexCount
    this.componentCount = input.componentCount
    this.solverVersion = input.solverVersion
    this.sourceRecipeHash = input.sourceRecipeHash
    this.sampleTimesMsBuffer = input.sampleTimesMs.slice()
    this.positionsBuffer = input.positions.slice()
    this.sampleCount = this.sampleTimesMsBuffer.length
    this.durationMs = this.sampleTimesMsBuffer[this.sampleCount - 1]
    this.byteLength = this.sampleTimesMsBuffer.byteLength + this.positionsBuffer.byteLength
  }

  /** Returns a copy of sample times for diagnostics/encoding. */
  sampleTimes(): Float64Array { return this.sampleTimesMsBuffer.slice() }

  /** Returns a copy of the packed position samples for encoding. */
  packedPositions(): Float32Array { return this.positionsBuffer.slice() }

  /**
   * Samples layer-local x/y positions at clip-local milliseconds.
   *
   * Negative/non-finite time clamps to the first sample. Time beyond duration
   * clamps unless loop is true and duration is positive. `output`, when given,
   * must contain exactly `vertexCount * 2` values and is mutated in place.
   */
  samplePositions(timeMs: number, loop = false, output?: Float32Array): Float32Array {
    const result = output ?? new Float32Array(this.vertexCount * 2)
    if (result.length !== this.vertexCount * 2) throw new RangeError('Mesh deformation output buffer length is invalid')
    const time = this.normalizeTime(timeMs, loop)
    const upper = this.upperSample(time)
    const lower = Math.max(0, upper - 1)
    const lowerTime = this.sampleTimesMsBuffer[lower]
    const upperTime = this.sampleTimesMsBuffer[upper]
    const alpha = upper === lower || upperTime === lowerTime ? 0 : (time - lowerTime) / (upperTime - lowerTime)
    const stride = this.vertexCount * this.componentCount
    for (let vertex = 0; vertex < this.vertexCount; vertex++) {
      const low = lower * stride + vertex * this.componentCount
      const high = upper * stride + vertex * this.componentCount
      result[vertex * 2] = this.positionsBuffer[low] + (this.positionsBuffer[high] - this.positionsBuffer[low]) * alpha
      result[vertex * 2 + 1] = this.positionsBuffer[low + 1] + (this.positionsBuffer[high + 1] - this.positionsBuffer[low + 1]) * alpha
    }
    return result
  }

  private normalizeTime(timeMs: number, loop: boolean): number {
    if (!Number.isFinite(timeMs) || timeMs <= 0 || this.durationMs <= 0) return 0
    if (loop) return timeMs % this.durationMs
    return Math.min(timeMs, this.durationMs)
  }

  private upperSample(timeMs: number): number {
    if (timeMs <= 0 || this.sampleCount === 1) return 0
    if (timeMs >= this.durationMs) return this.sampleCount - 1
    let low = 1, high = this.sampleCount - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.sampleTimesMsBuffer[middle] < timeMs) low = middle + 1
      else high = middle
    }
    return low
  }
}
