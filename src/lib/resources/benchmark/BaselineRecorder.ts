import { validateBaselineProtocol, type BaselineProtocol, type BaselineSample } from './types'
import { summarizeNumbers } from '../performance/sampleStatistics'

/**
 * Bounded reference recorder independent of React/browser/GPU handles. Holds only
 * up to repetitions × timestamps numeric rows (hard maximum 1,200); unavailable
 * heap/GPU values stay null. It never retains scenes, pixel buffers or raw URLs.
 * A complete sparse run is not a long playback/GC/OS-memory soak qualification.
 */
export class BaselineRecorder {
  private samples: BaselineSample[] = []
  private readonly capacity: number
  constructor(private readonly protocol: BaselineProtocol) {
    validateBaselineProtocol(protocol)
    this.capacity = protocol.repetitions * protocol.sampleFractions.length
  }

  /** Diagnostic safety threshold checked between frames; cannot preempt one native allocation. */
  memoryStopReason(knownBytes: number, heapBytes: number | null): string | null {
    if (knownBytes > this.protocol.knownByteLimit) return 'known-resource-limit'
    if (heapBytes !== null && heapBytes > this.protocol.heapByteLimit) return 'heap-limit'
    return null
  }

  /** Records a detached finite sample in exact repetition/time order; rejects overflow or duplicate points. */
  record(sample: BaselineSample): void {
    if (this.samples.length >= this.capacity) throw new RangeError('Baseline sample capacity reached.')
    const index = this.samples.length
    const expectedRepetition = Math.floor(index / this.protocol.sampleFractions.length)
    const previous = this.samples[index - 1]
    if (sample.repetition !== expectedRepetition || !Number.isFinite(sample.timeMs) || sample.timeMs < 0
      || (previous?.repetition === sample.repetition && sample.timeMs <= previous.timeMs)
      || Object.values(sample).some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
      throw new RangeError('Invalid or out-of-order baseline sample.')
    }
    this.samples.push({ ...sample })
  }

  /** Returns versioned raw points and summaries; aborted/partial runs are never marked complete. */
  finish(reason: string | null = null) {
    const values = (key: keyof BaselineSample) => this.samples.map(sample => sample[key]).filter((value): value is number => value !== null)
    const first = this.samples[0], last = this.samples[this.samples.length - 1]
    return {
      schemaVersion: 1, kind: 'sparse-render-baseline', status: !reason && this.samples.length === this.capacity ? 'complete' : 'incomplete',
      reason: reason ?? (this.samples.length === this.capacity ? null : 'missing-samples'),
      protocol: { ...this.protocol, sampleFractions: [...this.protocol.sampleFractions] },
      samples: this.samples.map(sample => ({ ...sample })),
      summary: {
        evaluationMs: summarizeNumbers(values('evaluationMs')), renderMs: summarizeNumbers(values('renderMs')),
        frameCpuMs: summarizeNumbers(this.samples.map(sample => sample.evaluationMs + sample.renderMs)),
        layerVisits: summarizeNumbers(values('layerVisits')), knownBytes: summarizeNumbers(values('knownBytes')),
        heapBytes: summarizeNumbers(values('heapBytes')),
        observedKnownDeltaBytes: first && last ? last.knownBytes - first.knownBytes : null,
        observedHeapDeltaBytes: first?.heapBytes != null && last?.heapBytes != null ? last.heapBytes - first.heapBytes : null,
      },
      limitations: ['Renderer-only; editor DOM, React commit, transport and system process RAM are separate.',
        'Sparse authored timestamps are not presented FPS or 10 continuous playback loops.',
        'Known-resource and browser heap estimates overlap and must not be added.',
        'A bounded observed delta does not prove absence of retained-memory leaks.'],
    }
  }
}
