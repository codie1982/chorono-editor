/** Versioned, sparse render sampling; authored timestamps are not real-time playback/FPS. */
export interface BaselineProtocol {
  warmupMs: number
  repetitions: number
  sampleFractions: readonly number[]
  knownByteLimit: number
  heapByteLimit: number
}

export const DEFAULT_BASELINE_PROTOCOL: BaselineProtocol = {
  warmupMs: 60_000,
  repetitions: 10,
  sampleFractions: [0, 0.125, 0.25, 0.5, 0.75, 0.9999791666666666],
  knownByteLimit: 512 * 1024 ** 2,
  heapByteLimit: 768 * 1024 ** 2,
}

/** Detached numeric sample. Byte categories overlap only where explicitly labelled as subsets. */
export interface BaselineSample {
  repetition: number
  timeMs: number
  evaluationMs: number
  renderMs: number
  /** Unique main-frame counters; optional for historical reports and test hosts. */
  lodRepresentedLayers?: number
  lodGroups?: number
  lodBuilds?: number
  lodResidentBytes?: number
  lodHits?: number
  lodMisses?: number
  lodBudgetDenials?: number
  processedLayers?: number
  culledLayers?: number
  layerVisits: number
  knownBytes: number
  heapBytes: number | null
  canvas2dBytes: number
  canvas2dCount: number
  canvasRegistrations: number
  maskResidentBytes: number
  maskAllocations: number
  maskReuses: number
  /** Registered allocation ledger only, overlapping the resource estimates.
   * Historical references omit these counters; never interpret that as zero. */
  admittedBytes?: number
  admissionProtectedBytes?: number
  admissionDenials?: number
  imageBytes: number
  videoFrameBytes: number
  pcmBytes: number
  gpuBufferBytes: number
  gpuDrawCalls: number
  gpuMs: number | null
}

/** Rejects unbounded/ambiguous protocols before any rendering or buffer allocation. */
export function validateBaselineProtocol(protocol: BaselineProtocol): void {
  if (!Number.isFinite(protocol.warmupMs) || protocol.warmupMs < 0 || protocol.warmupMs > 600_000
    || !Number.isInteger(protocol.repetitions) || protocol.repetitions < 1 || protocol.repetitions > 100
    || !protocol.sampleFractions.length || protocol.sampleFractions.length * protocol.repetitions > 1200
    || protocol.sampleFractions.some((fraction, index) => !Number.isFinite(fraction) || fraction < 0 || fraction >= 1
      || (index > 0 && fraction <= protocol.sampleFractions[index - 1]))
    || !Number.isSafeInteger(protocol.knownByteLimit) || protocol.knownByteLimit <= 0
    || !Number.isSafeInteger(protocol.heapByteLimit) || protocol.heapByteLimit <= 0) {
    throw new RangeError('Invalid or unbounded baseline protocol.')
  }
}
