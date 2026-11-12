import { computeLocalTime } from '@/lib/evaluator'
import type { TrajectoryContext, TrajectorySample, TrajectorySamplingOptions } from './types'

interface SamplingResult { segments: TrajectorySample[][]; truncated: boolean }

/** Normalize caller budgets before allocation; never use source counts as an
 * unbounded subdivision limit. Invalid options fall back to useful defaults. */
export function trajectorySampleBudget(options: TrajectorySamplingOptions): number {
  return Number.isFinite(options.maxSamples) ? Math.max(16, Math.min(2048, Math.floor(options.maxSamples!))) : 256
}

/** Find known hold/clock discontinuities on relevant transforms. Repetition
 * candidates are merely probes; the canonical computeLocalTime decides whether
 * a local hold boundary is actually crossed. Source clock logic is not copied.
 * Candidate enumeration is bounded by the same preview budget. */
function sampleBreaks(context: TrajectoryContext, budget: number): { cuts: number[]; keys: number[]; truncated: boolean } {
  const ids = new Set([context.layer.id, ...context.ancestors.map(layer => layer.id)])
  const cuts = new Set<number>(), keys = new Set<number>(), duration = context.timeline.durationMs
  let truncated = false, probes = 0
  scan: for (const timeline of context.scene.timelines) {
    const relevant = timeline.tracks.filter(track => Array.from(ids).some(id => track.target.startsWith(`layers.${id}.transform.`)))
    for (const track of relevant) {
      const sorted = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
      for (let i = 0; i < sorted.length; i++) {
        const key = sorted[i]
        if (!Number.isFinite(key.timeMs) || key.timeMs < 0) continue
        if (key.timeMs <= duration) keys.add(key.timeMs)
        if (!i || sorted[i - 1].easing?.type !== 'hold' || sorted[i - 1].tangentMode === 'linear'
            || sorted[i - 1].value === key.value) continue
        if (timeline.id === context.timeline.id) { if (key.timeMs > 0 && key.timeMs < duration) cuts.add(key.timeMs); continue }
        if (!(timeline.durationMs > 0)) continue
        const cycles = Math.min(budget, Math.ceil(duration / timeline.durationMs))
        if (cycles < Math.ceil(duration / timeline.durationMs)) truncated = true
        for (let cycle = 0; cycle < cycles; cycle++) {
          for (const time of [cycle * timeline.durationMs + key.timeMs, (cycle + 1) * timeline.durationMs - key.timeMs]) {
            if (++probes > budget * 4) { truncated = true; break scan }
            if (time <= 0 || time >= duration) continue
            const epsilon = Math.max(1e-6, Math.abs(time) * Number.EPSILON * 8)
            const before = computeLocalTime(timeline, time - epsilon), at = computeLocalTime(timeline, time), after = computeLocalTime(timeline, time + epsilon)
            if ((before < key.timeMs && at >= key.timeMs) || (after < key.timeMs && at >= key.timeMs)) cuts.add(time)
          }
        }
      }
    }
  }
  return { cuts: Array.from(cuts).sort((a, b) => a - b), keys: Array.from(keys), truncated }
}

/** Bounded adaptive polylines in composition pixels, with independent segments
 * across known hold jumps. Uniform seeds reduce midpoint aliasing; recursive
 * midpoint probes refine curved motion. Tolerance is a visual target, not a
 * formal error bound for arbitrary procedural frequencies. Budget exhaustion
 * reports truncation; samples are transient and never written into scene JSON.
 * The supplied projector should memoize within this one model build. */
export function sampleTrajectory(context: TrajectoryContext, options: TrajectorySamplingOptions,
  project: (timeMs: number) => TrajectorySample | null): SamplingResult {
  const budget = trajectorySampleBudget(options)
  const tolerance = Number.isFinite(options.tolerancePx) ? Math.max(0.01, options.tolerancePx!) : 0.75
  const duration = context.timeline.durationMs
  if (!(duration > 0) || !Number.isFinite(duration)) return { segments: [], truncated: false }
  const breaks = sampleBreaks(context, budget), intervals: Array<[number, number]> = []
  if (breaks.truncated) return { segments: [], truncated: true }
  let start = 0
  for (const cut of breaks.cuts.slice(0, Math.floor(budget / 4))) {
    const epsilon = Math.min(cut / 2, (duration - cut) / 2, Math.max(1e-6, Math.abs(cut) * Number.EPSILON * 8))
    if (cut - epsilon > start) intervals.push([start, cut - epsilon])
    start = cut + epsilon
  }
  // When cut enumeration exceeds the output budget, stop before the first
  // omitted jump rather than drawing a false continuous tail across it.
  const firstOmitted = breaks.cuts[Math.floor(budget / 4)]
  const end = firstOmitted === undefined ? duration : firstOmitted - Math.max(1e-6, Math.abs(firstOmitted) * Number.EPSILON * 8)
  if (start <= end) intervals.push([start, end])
  const segments: TrajectorySample[][] = []
  let remaining = budget, truncated = breaks.truncated || breaks.cuts.length > Math.floor(budget / 4)
  for (const [from, to] of intervals) {
    if (remaining < 2) { truncated = true; break }
    const count = Math.min(16, Math.max(1, Math.floor(remaining / 4)))
    const times = new Set([from, to])
    for (let i = 1; i < count; i++) times.add(from + (to - from) * i / count)
    for (const key of breaks.keys) if (key > from && key < to && times.size < Math.max(2, remaining / 2)) times.add(key)
    const seeds = Array.from(times).sort((a, b) => a - b), segment: TrajectorySample[] = []
    const append = (sample: TrajectorySample | null) => {
      if (sample && segment[segment.length - 1]?.timeMs !== sample.timeMs && remaining > 0) { segment.push(sample); remaining-- }
    }
    const refine = (a: TrajectorySample, b: TrajectorySample, depth: number) => {
      if (remaining <= 1 || depth >= 10) { truncated = true; append(b); return }
      const mid = project((a.timeMs + b.timeMs) / 2)
      if (!mid) { truncated = true; append(b); return }
      const error = Math.hypot(mid.world.x - (a.world.x + b.world.x) / 2, mid.world.y - (a.world.y + b.world.y) / 2)
      if (error > tolerance) { refine(a, mid, depth + 1); refine(mid, b, depth + 1) }
      else append(b)
    }
    append(project(seeds[0]))
    for (let i = 1; i < seeds.length && remaining > 0; i++) {
      const a = project(seeds[i - 1]), b = project(seeds[i])
      if (a && b) refine(a, b, 0)
    }
    if (segment.length) segments.push(segment)
    if (remaining === 0) truncated = true
  }
  return { segments, truncated }
}
