import type { ChronoScene, Keyframe, Track } from '../../types'
import type { Point } from '../../canvas/math/rotateMath'
import { trajectoryPositionFromWorld } from './frame'
import { editableTrajectory, requireTrajectoryTime, TRAJECTORY_EDIT_LIMITS, writePositionKey } from './editHelpers'
import { trajectoryTrackCommand } from './trackEditCommand'
import type { TrajectoryCommandScope, TrajectoryEditResult } from './commandTypes'
import { guardedTrajectoryKeyIds } from './keyIds'

export interface DrawTrajectoryOptions extends TrajectoryCommandScope {
  worldPoints: readonly Point[]
  startMs: number
  endMs: number
  distribution: 'equal-time' | 'distance'
  /** Append refuses existing-time collisions. Replace requires an explicit
   * selected time range, removes only its x/y keys, and retains outside records. */
  mode?: 'append' | 'replace-range'
  replaceRange?: { startMs: number; endMs: number }
}

/** Prepare a bounded clicked/drawn route as native scalar x/y keys. Times are
 * explicit local ms; each world point uses the parent inverse at its own time.
 * Append is the safe default and never overwrites existing keys. Replacement
 * is limited to the explicit selected range; outside key records/settings stay
 * exact, but interpolation in adjacent crossing segments may change. Preview
 * the returned command's actual evaluated result before committing it once. */
export function drawTrajectory(scene: ChronoScene, options: DrawTrajectoryOptions): TrajectoryEditResult {
  const context = editableTrajectory(scene, options)
  requireTrajectoryTime(context, options.startMs); requireTrajectoryTime(context, options.endMs)
  if (!(options.endMs > options.startMs)) throw new Error('Draw Motion needs an explicit increasing start/end time range.')
  if (options.worldPoints.length < 2 || options.worldPoints.length > TRAJECTORY_EDIT_LIMITS.drawPoints
    || options.worldPoints.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error(`Draw Motion accepts 2–${TRAJECTORY_EDIT_LIMITS.drawPoints} finite composition points.`)
  }
  if (!['equal-time', 'distance'].includes(options.distribution)) throw new Error('Choose equal-time or distance timing for the route.')
  const mode = options.mode ?? 'append', range = options.replaceRange
  if (mode !== 'append' && mode !== 'replace-range') throw new Error('Choose append or an explicit replace-range mode.')
  if (mode === 'replace-range') {
    if (!range) throw new Error('Replacing motion requires the user-selected position-key time range.')
    requireTrajectoryTime(context, range.startMs); requireTrajectoryTime(context, range.endMs)
    if (range.startMs > options.startMs || range.endMs < options.endMs || range.endMs < range.startMs) {
      throw new Error('Every drawn key must remain inside the explicit replacement range.')
    }
  }
  const timed = routeTimes(options)
  const points = timed.points.map((world, index) => {
    const local = trajectoryPositionFromWorld(context, timed.times[index], world)
    if (!local) throw new Error('A drawn point has a noninvertible parent at its assigned key time.')
    return { timeMs: timed.times[index], local }
  })
  let xTrack: Track = context.xTrack ?? { target: context.xTarget, keyframes: [] }
  let yTrack: Track = context.yTrack ?? { target: context.yTarget, keyframes: [] }
  const keyId = guardedTrajectoryKeyIds(scene)
  const selectedIds: string[] = [], supportIds: string[] = [], diagnostics = [...timed.diagnostics]
  if (mode === 'append') {
    for (const track of [xTrack, yTrack]) if (points.some(point => track.keyframes.some(key => Math.abs(key.timeMs - point.timeMs) <= 1))) {
      throw new Error('Append would collide with an existing position key within 1 ms. Choose free times or explicitly select a replacement range.')
    }
    for (const point of points) {
      const x = writePositionKey(xTrack, context.xTarget, point.timeMs, point.local.x, keyId)
      const y = writePositionKey(yTrack, context.yTarget, point.timeMs, point.local.y, keyId)
      xTrack = x.track; yTrack = y.track
      selectedIds.push(x.selectedId, y.selectedId); supportIds.push(...x.supportIds, ...y.supportIds)
      diagnostics.push(...x.diagnostics, ...y.diagnostics)
    }
    diagnostics.push(`Append adds ${points.length} position-node pairs at ${options.startMs}–${options.endMs} ms; no existing key IDs are removed. Adjacent interpolation can change.`)
  } else {
    let removed = 0
    const replace = (track: Track, axis: 'x' | 'y'): Track => {
      const inside = track.keyframes.filter(key => key.timeMs >= range!.startMs && key.timeMs <= range!.endMs)
      const outside = track.keyframes.filter(key => key.timeMs < range!.startMs || key.timeMs > range!.endMs)
      removed += inside.length
      if (points.some(point => outside.some(key => Math.abs(key.timeMs - point.timeMs) <= 1))) {
        throw new Error('A new position key would collide with a key outside the selected replacement range.')
      }
      const route = points.map(point => {
        const existing = inside.filter(key => key.timeMs === point.timeMs)
        if (existing.length > 1) throw new Error('Ambiguous duplicate source times cannot be replaced safely.')
        const key: Keyframe = existing.length ? { ...existing[0], value: point.local[axis] }
          : { id: keyId({ target: track.target, timeMs: point.timeMs, role: 'node' }), timeMs: point.timeMs, value: point.local[axis], easing: { type: 'linear' } }
        selectedIds.push(key.id)
        return key
      })
      return { ...track, keyframes: [...outside, ...route].sort((a, b) => a.timeMs - b.timeMs) }
    }
    xTrack = replace(xTrack, 'x'); yTrack = replace(yTrack, 'y')
    diagnostics.push(`Replace ${range!.startMs}–${range!.endMs} ms affects ${removed} existing position keys and writes ${points.length * 2} keys. Outside key records/settings remain; adjacent segments crossing the range may change.`)
  }
  const selected = Array.from(new Set(selectedIds))
  return trajectoryTrackCommand(scene, options, [{ before: context.xTrack, after: xTrack }, { before: context.yTrack, after: yTrack }],
    selected, 'Draw position motion', Array.from(new Set(diagnostics)), supportIds.filter(id => !selected.includes(id)))
}

/** Assign timestamps without assuming drawing order implies a playback clock.
 * Distance timing drops consecutive coincident geometry points; a fully static
 * route uses equal-time keys explicitly. All generated times must be >1 ms apart. */
function routeTimes(options: DrawTrajectoryOptions): { points: Point[]; times: number[]; diagnostics: string[] } {
  const diagnostics: string[] = []
  let points = options.worldPoints.map(point => ({ ...point }))
  if (options.distribution === 'distance') {
    points = points.filter((point, index) => index === 0 || point.x !== options.worldPoints[index - 1].x || point.y !== options.worldPoints[index - 1].y)
    if (points.length < 2) { points = [points[0], points[0]]; diagnostics.push('The route is stationary; equal-time endpoint keys are used.') }
    else if (points.length !== options.worldPoints.length) diagnostics.push('Consecutive coincident points were omitted for distance timing.')
  }
  const distances = [0]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  const total = distances[distances.length - 1]
  const times = points.map((_, index) => options.startMs + (options.endMs - options.startMs)
    * (options.distribution === 'distance' && total > 0 ? distances[index] / total : index / (points.length - 1)))
  for (let i = 1; i < times.length; i++) if (!Number.isFinite(times[i]) || times[i] - times[i - 1] <= 1) {
    throw new Error('The draw time range is too short: position nodes must be more than 1 ms apart.')
  }
  return { points, times, diagnostics }
}
