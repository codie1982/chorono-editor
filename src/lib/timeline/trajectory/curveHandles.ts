import type { EasingDefinition, Keyframe, Track } from '../../types'
import type { TrajectoryContext, TrajectoryPoint } from './types'
import { trajectoryPositionToWorld } from './frame'

export type MotionHandleSide = 'in' | 'out'
export interface MotionCurveHandle { side: MotionHandleSide; timeMs: number; startMs: number; endMs: number; world: TrajectoryPoint }
export const LINEAR_MOTION_BEZIER = { cx1: 1 / 3, cy1: 1 / 3, cx2: 2 / 3, cy2: 2 / 3 }

/** Exact cubic representation of supported native temporal easing. Ease In
 * Out is piecewise and must be split by the canonical insertion helper first. */
export function motionBezier(easing: EasingDefinition) {
  if (easing.type === 'customBezier') return easing.bezier ?? LINEAR_MOTION_BEZIER
  if (easing.type === 'easeIn') return { cx1: 1 / 3, cy1: 0, cx2: 2 / 3, cy2: 0 }
  if (easing.type === 'easeOut') return { cx1: 1 / 3, cy1: 1, cx2: 2 / 3, cy2: 1 }
  return LINEAR_MOTION_BEZIER
}

/** Only an exact, adjacent, native key pair defines a draggable segment.
 * Sparse-axis intervals become exact through curve-preserving insertion. */
export function motionKeyPair(track: Track | undefined, startMs: number, endMs: number): [Keyframe, Keyframe] | null {
  const keys = track?.keyframes, a = keys?.find(key => key.timeMs === startMs), b = keys?.find(key => key.timeMs === endMs)
  if (!a || !b || keys!.some(key => key.timeMs > startMs && key.timeMs < endMs) || typeof a.value !== 'number' || typeof b.value !== 'number') return null
  return [a, b]
}

/** Controls are native X/Y value controls projected through the node-time
 * parent. Their normalized time coordinates are left to each scalar curve;
 * animated parents may make the sampled world path non-cubic. */
export function trajectoryCurveHandles(context: TrajectoryContext, timeMs: number): MotionCurveHandle[] {
  const times = Array.from(new Set([...(context.xTrack?.keyframes ?? []), ...(context.yTrack?.keyframes ?? [])].map(key => key.timeMs))).sort((a, b) => a - b)
  const i = times.indexOf(timeMs), result: MotionCurveHandle[] = []
  for (const side of ['in', 'out'] as const) {
    const startMs = side === 'in' ? times[i - 1] : timeMs, endMs = side === 'in' ? timeMs : times[i + 1]
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    const x = motionKeyPair(context.xTrack, startMs, endMs), y = motionKeyPair(context.yTrack, startMs, endMs)
    if (!x || !y || ![x[0], y[0]].some(key => key.easing.type === 'customBezier') || [x[0], y[0]].some(key => key.easing.type === 'hold' || key.easing.type === 'easeInOut' || key.tangentMode === 'linear')) continue
    const control = (pair: [Keyframe, Keyframe]) => {
      const bezier = motionBezier(pair[0].easing), a = pair[0].value as number, b = pair[1].value as number
      return a + (b - a) * (side === 'out' ? bezier.cy1 : bezier.cy2)
    }
    result.push({ side, timeMs, startMs, endMs, world: trajectoryPositionToWorld(context, timeMs, { x: control(x), y: control(y) }) })
  }
  return result
}
