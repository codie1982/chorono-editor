import { BaselineRecorder } from './BaselineRecorder'
import { type BaselineProtocol, type BaselineSample, validateBaselineProtocol } from './types'

/** Browser/platform adapter owns frame pacing, visibility clock, rendering and resource handles. */
export interface BaselineHost {
  durationMs: number
  activeNow(): number
  nextFrame(signal: AbortSignal): Promise<void>
  draw(timeMs: number, repetition: number): BaselineSample
  checkpoint(): Promise<string>
}
export interface BaselineProgress { phase: 'warming' | 'sampling' | 'checking'; warmupMs: number; samples: number }

/**
 * Runs a bounded, sparse authored-time baseline. The default warms for 60 active
 * seconds, then renders six points × ten repetitions, paced by the host. This
 * is explicitly not ten continuous 48-second playback loops. Abort/memory guard
 * preserves partial data with an incomplete status. No scene/DOM handles are
 * retained in the report; post-timing checkpoints are hashes only. Pixel reads
 * never run between timed samples, avoiding readback-triggered backend changes.
 */
export class BaselineRunner {
  constructor(private readonly protocol: BaselineProtocol) { validateBaselineProtocol(protocol) }

  /** Executes sequentially on one host; cancellation is observed between native frame operations. */
  async run(host: BaselineHost, signal: AbortSignal, progress: (value: BaselineProgress) => void = () => {}) {
    const recorder = new BaselineRecorder(this.protocol)
    const checkpoints: Array<{ timeMs: number; sha256: string }> = []
    const started = host.activeNow()
    let warmupFrames = 0, measured = 0, reason: string | null = null
    let warmupPeakKnownBytes = 0, warmupPeakHeapBytes: number | null = null
    let warmupElapsedMs = 0
    const guard = (sample: BaselineSample) => recorder.memoryStopReason(sample.knownBytes, sample.heapBytes)
    try {
      while (host.activeNow() - started < this.protocol.warmupMs) {
        await host.nextFrame(signal)
        const fraction = this.protocol.sampleFractions[warmupFrames % this.protocol.sampleFractions.length]
        const sample = host.draw(fraction * host.durationMs, 0)
        warmupFrames++
        warmupPeakKnownBytes = Math.max(warmupPeakKnownBytes, sample.knownBytes)
        if (sample.heapBytes !== null) warmupPeakHeapBytes = Math.max(warmupPeakHeapBytes ?? 0, sample.heapBytes)
        warmupElapsedMs = host.activeNow() - started
        progress({ phase: 'warming', warmupMs: warmupElapsedMs, samples: 0 })
        reason = guard(sample)
        if (reason) break
      }
      if (!reason) {
        for (let repetition = 0; repetition < this.protocol.repetitions; repetition++) {
          for (const fraction of this.protocol.sampleFractions) {
            await host.nextFrame(signal)
            const timeMs = fraction * host.durationMs
            const sample = host.draw(timeMs, repetition)
            recorder.record(sample)
            measured++
            progress({ phase: 'sampling', warmupMs: warmupElapsedMs, samples: measured })
            reason = guard(sample)
            if (reason) break
          }
          if (reason) break
        }
      }
      if (!reason) {
        progress({ phase: 'checking', warmupMs: warmupElapsedMs, samples: measured })
        for (const fraction of this.protocol.sampleFractions) {
          await host.nextFrame(signal)
          const timeMs = fraction * host.durationMs
          const sample = host.draw(timeMs, 0)
          reason = guard(sample)
          if (reason) break
          checkpoints.push({ timeMs, sha256: await host.checkpoint() })
        }
      }
    } catch (error) {
      reason = signal.aborted ? 'cancelled' : error instanceof Error ? error.message : 'benchmark-error'
    }
    if (signal.aborted && !reason) reason = 'cancelled'
    return { ...recorder.finish(reason), checkpoints,
      warmup: { requestedMs: this.protocol.warmupMs, activeElapsedMs: warmupElapsedMs, frames: warmupFrames,
        peakKnownBytes: warmupPeakKnownBytes, peakHeapBytes: warmupPeakHeapBytes },
      activeElapsedMs: host.activeNow() - started }
  }
}
