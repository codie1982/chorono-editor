import type { ChronoScene, Track } from '../../types'
import type { Point } from '../../canvas/math/rotateMath'
import { projectTrajectoryPosition, trajectoryPositionFromWorld } from './frame'
import { editableTrajectory, requireTrajectoryTime, trajectoryNodeRefs, trajectorySelectedIds, writePositionKey } from './editHelpers'
import { trajectoryTrackCommand } from './trackEditCommand'
import type { TrajectoryCommandScope, TrajectoryEditResult, TrajectoryNodeRef } from './commandTypes'
import type { TrajectoryContext } from './types'
import { guardedTrajectoryKeyIds, type TrajectoryKeyIdAllocator } from './keyIds'

/** Set/update a native x/y key pair at one exact timeline-local time. worldPoint
 * is the displayed anchor in composition pixels; parent inversion is evaluated
 * at that key time, and the authored anchor offset is removed. Existing key
 * identity/easing/tangents survive. Unsupported/near-collision edits throw before
 * writes; only affected position arrays and timeline membership can change. */
export function setTrajectoryPoint(scene: ChronoScene,
  options: TrajectoryCommandScope & { timeMs: number; worldPoint: Point; keyId?: TrajectoryKeyIdAllocator }): TrajectoryEditResult {
  const context = editableTrajectory(scene, options)
  requireTrajectoryTime(context, options.timeMs)
  return positionEdits(context, [{ timeMs: options.timeMs, world: options.worldPoint }], 'Set position key', options.keyId)
}

/** Translate selected source nodes by one composition-space delta. Each node
 * uses its own key-time parent inverse; sparse axes are inserted from underlying
 * source curves, then changed. This does not retime keys or feed rendered
 * controller/binding/follow-path output back into input. A zero delta is a no-op. */
export function moveTrajectoryNodes(scene: ChronoScene,
  options: TrajectoryCommandScope & { nodes: readonly TrajectoryNodeRef[]; deltaWorld: Point; keyId?: TrajectoryKeyIdAllocator }): TrajectoryEditResult {
  const context = editableTrajectory(scene, options), nodes = trajectoryNodeRefs(context, options.nodes)
  if (![options.deltaWorld.x, options.deltaWorld.y].every(Number.isFinite)) throw new Error('Position movement must be a finite composition-space delta.')
  if (options.deltaWorld.x === 0 && options.deltaWorld.y === 0) {
    return { command: null, selectedIds: trajectorySelectedIds(nodes), diagnostics: [] }
  }
  const points = nodes.map(node => {
    const position = projectTrajectoryPosition(context, node.timeMs)
    if (!position) throw new Error('This node has no invertible editable parent transform at its key time.')
    return { timeMs: node.timeMs, world: { x: position.world.x + options.deltaWorld.x, y: position.world.y + options.deltaWorld.y } }
  })
  return positionEdits(context, points, `Move ${nodes.length} position nodes`, options.keyId)
}

/** Prepare stable track snapshots from the original context for every node.
 * Earlier selected edits never influence later source/parent evaluations. */
function positionEdits(context: TrajectoryContext, points: readonly { timeMs: number; world: Point }[], label: string,
  allocate?: TrajectoryKeyIdAllocator): TrajectoryEditResult {
  let xTrack: Track | undefined = context.xTrack, yTrack: Track | undefined = context.yTrack
  const selectedIds: string[] = [], supportIds: string[] = [], diagnostics: string[] = []
  const keyId = guardedTrajectoryKeyIds(context.scene, allocate)
  for (const point of points) {
    if (![point.world.x, point.world.y].every(Number.isFinite)) throw new Error('Position points must be finite composition coordinates.')
    const local = trajectoryPositionFromWorld(context, point.timeMs, point.world)
    if (!local) throw new Error('This point cannot be mapped through its parent transform at the requested key time.')
    const x = writePositionKey(xTrack, context.xTarget, point.timeMs, local.x, keyId)
    const y = writePositionKey(yTrack, context.yTarget, point.timeMs, local.y, keyId)
    xTrack = x.track; yTrack = y.track
    selectedIds.push(x.selectedId, y.selectedId)
    supportIds.push(...x.supportIds, ...y.supportIds)
    diagnostics.push(...x.diagnostics, ...y.diagnostics)
  }
  const selected = Array.from(new Set(selectedIds))
  return trajectoryTrackCommand(context.scene, { timelineId: context.timeline.id, layerId: context.layer.id },
    [{ before: context.xTrack, after: xTrack! }, { before: context.yTrack, after: yTrack! }],
    selected, label, Array.from(new Set(diagnostics)), supportIds.filter(id => !selected.includes(id)))
}
