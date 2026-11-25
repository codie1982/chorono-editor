import type { ChronoScene, EasingDefinition, Track } from '../../types'
import { editableTrajectory, writePositionKey } from './editHelpers'
import { projectTrajectoryPosition, trajectoryPositionFromWorld } from './frame'
import { trajectoryTrackCommand } from './trackEditCommand'
import { LINEAR_MOTION_BEZIER, motionBezier, motionKeyPair, trajectoryCurveHandles, type MotionCurveHandle } from './curveHandles'
import type { TrajectoryCommandScope } from './commandTypes'
import type { TrajectoryKeyIdAllocator } from './keyIds'
import type { TrajectoryPoint } from './types'

/** Change only the two native position channels over an explicit node interval.
 * Sparse endpoints are inserted by the existing shape-preserving splitter.
 * Existing IDs, unrelated keys, temporal fields and source transforms survive;
 * driver/singularity/stale-source guards remain owned by trajectory commands. */
export function setTrajectorySegmentEasing(scene: ChronoScene, scope: TrajectoryCommandScope & {
  startMs: number; endMs: number; easing: EasingDefinition; keyId?: TrajectoryKeyIdAllocator
}) {
  const context = editableTrajectory(scene, scope)
  if (!(scope.startMs >= 0 && scope.endMs > scope.startMs && scope.endMs <= context.timeline.durationMs)) throw new Error('Choose an interval between two position keys.')
  const selected: string[] = [], support: string[] = [], diagnostics: string[] = []
  const edits = (['x', 'y'] as const).map(axis => {
    const before = axis === 'x' ? context.xTrack : context.yTrack, target = `layers.${scope.layerId}.transform.${axis}`
    let after = before
    for (const time of [scope.startMs, scope.endMs]) {
      const sample = projectTrajectoryPosition(context, time)
      if (!sample) throw new Error('The position interval cannot be projected.')
      const write = writePositionKey(after, target, time, sample.local[axis], scope.keyId)
      after = write.track; selected.push(write.selectedId); support.push(...write.supportIds); diagnostics.push(...write.diagnostics)
    }
    if (!motionKeyPair(after, scope.startMs, scope.endMs)) throw new Error('An intermediate position key divides this interval. Select its adjacent segment.')
    return { before, after: { ...after!, keyframes: after!.keyframes.map(key => key.timeMs !== scope.startMs ? key : {
      ...key, easing: scope.easing, tangentMode: scope.easing.type === 'linear' ? 'linear' as const : 'broken' as const,
    }) } }
  })
  return trajectoryTrackCommand(scene, scope, edits, selected, 'Edit motion segment', diagnostics, support)
}

/** Link only the incoming/outgoing viewport controls of this node. This does
 * not reinterpret the legacy per-segment temporal tangentMode. */
export function setTrajectoryHandleMode(scene: ChronoScene, scope: TrajectoryCommandScope & { timeMs: number; mode: 'aligned' | 'broken' }) {
  const context = editableTrajectory(scene, scope), selected: string[] = []
  const edits = [context.xTrack, context.yTrack].filter((track): track is Track => !!track).map(before => ({ before,
    after: { ...before, keyframes: before.keyframes.map(key => {
      if (key.timeMs !== scope.timeMs) return key
      selected.push(key.id); return { ...key, motionTangentMode: scope.mode }
    }) } }))
  return trajectoryTrackCommand(scene, scope, edits, selected, 'Link motion handles')
}

/** Enable native cubic controls on the intervals touching a node, with one
 * final guarded patch/Undo. Existing customBezier shapes remain untouched;
 * choosing this conversion explicitly replaces other adjacent easing modes. */
export function setTrajectoryNodeCurve(scene: ChronoScene, scope: TrajectoryCommandScope & { timeMs: number; mode: 'aligned' | 'broken' }) {
  const original = editableTrajectory(scene, scope)
  const times = Array.from(new Set([...(original.xTrack?.keyframes ?? []), ...(original.yTrack?.keyframes ?? [])].map(key => key.timeMs))).sort((a, b) => a - b)
  const i = times.indexOf(scope.timeMs)
  if (i < 0) throw new Error('Choose an existing position key.')
  let next = scene
  for (const [startMs, endMs] of [[times[i - 1], scope.timeMs], [scope.timeMs, times[i + 1]]]) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    const ctx = editableTrajectory(next, scope)
    if ([ctx.xTrack, ctx.yTrack].every(track => {
      const leading = motionKeyPair(track, startMs, endMs)?.[0]
      return leading?.easing.type === 'customBezier' && leading.tangentMode !== 'linear'
    })) continue
    const edit = setTrajectorySegmentEasing(next, { ...scope, startMs, endMs, easing: { type: 'customBezier', bezier: LINEAR_MOTION_BEZIER } })
    if (edit.command) next = edit.command.execute(next)
  }
  const mode = setTrajectoryHandleMode(next, scope)
  if (mode.command) next = mode.command.execute(next)
  const context = editableTrajectory(next, scope)
  return trajectoryTrackCommand(scene, scope, (['x', 'y'] as const).map(axis => ({
    before: axis === 'x' ? original.xTrack : original.yTrack, after: (axis === 'x' ? context.xTrack : context.yTrack)!,
  })), mode.selectedIds, 'Set motion node Bezier')
}

/** Drag a native value control in composition pixels. Normalized time control
 * coordinates are preserved, so temporal easing and node times do not drift.
 * The easing-only model cannot encode a nonconstant flat axis; refuse that
 * edit explicitly instead of flattening it or silently adding synthetic keys.
 * Aligned mode mirrors the opposite node handle; Corner keeps it independent. */
export function moveTrajectoryHandle(scene: ChronoScene, scope: TrajectoryCommandScope & { handle: MotionCurveHandle; world: TrajectoryPoint }) {
  const context = editableTrajectory(scene, scope), { handle } = scope
  const handles = trajectoryCurveHandles(context, handle.timeMs)
  const current = handles.find(item => item.side === handle.side && item.startMs === handle.startMs && item.endMs === handle.endMs)
  if (!current) throw new Error('The motion handle changed. Select its current node again.')
  if (Math.hypot(scope.world.x - current.world.x, scope.world.y - current.world.y) < 1e-7) {
    return { command: null, selectedIds: [context.xTrack, context.yTrack].flatMap(track => track?.keyframes.filter(key => key.timeMs === handle.timeMs).map(key => key.id) ?? []), diagnostics: [] }
  }
  const node = projectTrajectoryPosition(context, handle.timeMs)!, local = trajectoryPositionFromWorld(context, handle.timeMs, scope.world)
  if (!local) throw new Error('The parent transform cannot be inverted for this handle.')
  const mirrored = [context.xTrack, context.yTrack].some(track => track?.keyframes.find(key => key.timeMs === handle.timeMs)?.motionTangentMode === 'aligned')
  const opposite = mirrored ? handles.find(item => item.side !== handle.side) : undefined
  const edits = (['x', 'y'] as const).map(axis => {
    const before = (axis === 'x' ? context.xTrack : context.yTrack)!, keys = new Map(before.keyframes.map(key => [key.id, key]))
    for (const item of [current, ...(opposite ? [opposite] : [])]) {
      const pair = motionKeyPair(before, item.startMs, item.endMs)!, a = pair[0].value as number, b = pair[1].value as number
      const value = item === current ? local[axis] : 2 * node.local[axis] - local[axis], delta = b - a
      if (Math.abs(delta) < 1e-12 && Math.abs(value - a) > 1e-7) throw new Error(`Flat ${axis.toUpperCase()} keys cannot bend on that axis with easing handles. Add a position key or use a spline motion path.`)
      const bezier = motionBezier(pair[0].easing), control = Math.abs(delta) < 1e-12 ? (item.side === 'out' ? bezier.cy1 : bezier.cy2) : (value - a) / delta
      keys.set(pair[0].id, { ...pair[0], tangentMode: 'broken', easing: { type: 'customBezier', bezier: { ...bezier, [item.side === 'out' ? 'cy1' : 'cy2']: control } } })
    }
    return { before, after: { ...before, keyframes: before.keyframes.map(key => keys.get(key.id)!) } }
  })
  const selected = [context.xTrack, context.yTrack].flatMap(track => track?.keyframes.filter(key => key.timeMs === handle.timeMs).map(key => key.id) ?? [])
  return trajectoryTrackCommand(scene, scope, edits, selected, 'Move motion handle')
}
