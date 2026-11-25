import type { TrajectoryModel, TrajectoryPoint } from './types'
export interface TrajectoryHit { timeMs: number; startMs: number; endMs: number; distance: number }

/** Nearest sampled path segment in composition pixels, retaining its local
 * time interpolation. Input samples are already budgeted by the model owner.
 * No key-time rounding or global loop mapping; ties keep the first sample.
 * Only intervals bounded by two actual position nodes are editable. */
export function hitTrajectory(model: TrajectoryModel, point: TrajectoryPoint, radius: number): TrajectoryHit | null {
  let best: { timeMs: number; distance: number } | null = null
  for (const samples of model.segments) for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], dx = b.world.x - a.world.x, dy = b.world.y - a.world.y, length = dx * dx + dy * dy
    if (length < 1e-18) continue
    const t = Math.max(0, Math.min(1, ((point.x - a.world.x) * dx + (point.y - a.world.y) * dy) / length))
    const distance = Math.hypot(point.x - a.world.x - dx * t, point.y - a.world.y - dy * t)
    if (distance <= radius && (!best || distance < best.distance)) best = { timeMs: a.timeMs + (b.timeMs - a.timeMs) * t, distance }
  }
  if (!best) return null
  const end = model.nodes.findIndex(node => node.timeMs > best!.timeMs)
  return end > 0 ? { ...best, startMs: model.nodes[end - 1].timeMs, endMs: model.nodes[end].timeMs } : null
}
