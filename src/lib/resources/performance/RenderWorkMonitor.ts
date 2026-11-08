import { summarizeNumbers } from './sampleStatistics'

export type WorkStage = 'evaluation' | 'viewport'
interface Sample { at: number; ms: number }
export interface WorkSummary {
  count: number
  lastMs: number | null
  meanMs: number | null
  p95Ms: number | null
  recentPerSecond: number
  measuredMsPerSecond: number
  lastAt: number | null
}

/**
 * Bounded synchronous main-thread elapsed-time accounting, never system CPU%.
 * Each stage keeps at most 120 completed samples over five seconds. Stage times
 * are separate (evaluation occurs upstream of viewport drawing); workers, React
 * commit, browser paint and asynchronous GPU execution are outside this scope.
 * No timers/RAF, direct scene handles or per-layer trace are retained. Subscribers
 * own callback lifetimes and must release them when their consumer stops.
 */
export class RenderWorkMonitor {
  private samples: Record<WorkStage, Sample[]> = { evaluation: [], viewport: [] }
  private listeners: Record<WorkStage, Set<() => void>> = { evaluation: new Set(), viewport: new Set() }

  /** Read the latest completed interval in O(1), without distribution work.
   * Returns detached monotonic-ms data or null before the first sample.
   * Like the duration statistics, failed drawing attempts remain diagnostic samples.
   */
  getLastSample(stage: WorkStage): Readonly<Sample> | null {
    const values = this.samples[stage], last = values[values.length - 1]
    return last ? { ...last } : null
  }

  /** Subscribe to recorded work only; no timer, immediate emission or draw is
   * started. The owner must unsubscribe on unmount; release is idempotent.
   * Observer errors cannot fail the measured work. Listeners added during an
   * emission start at the next sample, preventing reentrant subscription loops.
   */
  subscribe(stage: WorkStage, listener: () => void): () => void {
    const subscription = () => listener()
    this.listeners[stage].add(subscription)
    return () => { this.listeners[stage].delete(subscription) }
  }

  /** Records a completed interval in monotonic milliseconds, including failed work. */
  record(stage: WorkStage, ms: number, at = performance.now()): void {
    if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(at)) return
    const entries = this.samples[stage]
    entries.push({ at, ms })
    if (entries.length > 120) entries.shift()
    if (this.listeners[stage].size) for (const listener of Array.from(this.listeners[stage])) {
      try { listener() } catch { /* Diagnostics must not interrupt rendering. */ }
    }
  }

  /** Measures only the synchronous callback; preserves its value and thrown errors. */
  measure<T>(stage: WorkStage, work: () => T): T {
    const start = performance.now()
    try { return work() } finally { this.record(stage, performance.now() - start) }
  }

  /** Aggregates the last five seconds, with actual observed work in the last second. */
  getSnapshot(now = performance.now()): Record<WorkStage, WorkSummary> {
    const summarize = (stage: WorkStage): WorkSummary => {
      const all = this.samples[stage]
      const recent = all.filter(s => now - s.at <= 5000)
      const second = recent.filter(s => now - s.at <= 1000)
      const distribution = summarizeNumbers(recent.map(s => s.ms))
      const last = all[all.length - 1]
      return {
        count: recent.length, lastMs: last?.ms ?? null, lastAt: last?.at ?? null,
        meanMs: distribution?.mean ?? null,
        p95Ms: distribution?.p95 ?? null,
        recentPerSecond: second.length,
        measuredMsPerSecond: second.reduce((sum, s) => sum + s.ms, 0),
      }
    }
    return { evaluation: summarize('evaluation'), viewport: summarize('viewport') }
  }
}

export const renderWorkMonitor = new RenderWorkMonitor()
