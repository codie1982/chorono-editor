import type { ChronoScene } from '@/lib/types'
import { prepareTrajectoryContext } from './capabilities'
import { projectTrajectoryPosition, trajectoryPositionFromWorld } from './frame'
import { sampleTrajectory } from './sampling'
import type { TrajectoryKeyRef, TrajectoryModel, TrajectoryNode, TrajectorySample, TrajectorySamplingOptions } from './types'

/**
 * Build a transient view of one layer's POSITION keys on one explicit timeline.
 * Exact authored x/y times form nodes; nearby but unequal times remain distinct
 * instead of silently merging records. Node IDs derive from timeline/layer/key
 * IDs, never array positions, so ordinary value edits retain selection identity.
 *
 * Every node/sample projects the rendered anchor at its OWN authoring time via
 * the canonical evaluator/world-matrix resolver. Samples/indices are runtime
 * view data, not new serialized path geometry or undo state. Ordinary unkeyed
 * layers are editable (kind none) so Add/Draw can author their first keys.
 * Capabilities distinguish Follow Path, inline SVG and procedural ownership.
 * Node and sample work is bounded; truncation is explicit. Rebuild after source,
 * timeline, parameter policy or sampling options change. No input is mutated.
 */
export function buildTrajectoryModel(scene: ChronoScene, timelineId: string, layerId: string,
  options: TrajectorySamplingOptions = {}): TrajectoryModel {
  const prepared = prepareTrajectoryContext(scene, timelineId, layerId)
  if (!prepared.ok) return { context: null, timelineId, layerId, durationMs: 0,
    capability: { editable: false, kind: 'none', diagnostics: prepared.diagnostics }, nodes: [], segments: [] }
  const context = prepared.context, groups = new Map<number, { refs: TrajectoryKeyRef[]; xKey?: TrajectoryKeyRef; yKey?: TrajectoryKeyRef }>()
  if (context.capability.previewable === false) return { context, timelineId, layerId,
    durationMs: context.timeline.durationMs, capability: context.capability, nodes: [], segments: [] }
  for (const [axis, track] of [['xKey', context.xTrack], ['yKey', context.yTrack]] as const) {
    for (const key of track?.keyframes ?? []) {
      if (!Number.isFinite(key.timeMs) || key.timeMs < 0 || typeof key.value !== 'number' || !Number.isFinite(key.value)) continue
      const group = groups.get(key.timeMs) ?? { refs: [] }
      const ref = { id: key.id, target: track!.target, timeMs: key.timeMs, value: key.value }
      group.refs.push(ref)
      if (!group[axis]) group[axis] = ref
      groups.set(key.timeMs, group)
    }
  }
  const cache = new Map<number, TrajectorySample | null>()
  const project = (timeMs: number) => {
    if (!cache.has(timeMs)) cache.set(timeMs, projectTrajectoryPosition(context, timeMs))
    return cache.get(timeMs)!
  }
  const limit = Number.isFinite(options.maxNodes) ? Math.max(1, Math.min(2048, Math.floor(options.maxNodes!))) : 512
  const ordered = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]), nodes: TrajectoryNode[] = []
  if (ordered.length > limit) {
    context.capability.editable = false
    context.capability.diagnostics.push({ code: 'node-budget', message: `Motion preview is limited to ${limit} authored nodes; reduce the key scope before editing.`, layerId, timelineId })
  }
  for (const [timeMs, group] of ordered.slice(0, limit)) {
    const point = project(timeMs)
    if (!point) continue
    const keyIds = group.refs.map(ref => ref.id).sort()
    nodes.push({ ...point, id: JSON.stringify([timelineId, layerId, keyIds]), keyIds,
      ...(group.xKey ? { xKey: group.xKey } : {}), ...(group.yKey ? { yKey: group.yKey } : {}) })
    if (context.capability.editable && !trajectoryPositionFromWorld(context, timeMs, point.world)) {
      context.capability.editable = false
      context.capability.diagnostics.push({ code: 'singular-parent', message: 'A parent transform is singular at an authored key time.', layerId, timelineId })
    }
  }
  const sampled = sampleTrajectory(context, options, project)
  if (sampled.truncated) context.capability.diagnostics.push({ code: 'sampling-budget', blocking: false,
    message: 'The trajectory preview reached its sample budget; it remains an approximation of the native animation.', layerId, timelineId })
  return { context, timelineId, layerId, durationMs: context.timeline.durationMs,
    capability: context.capability, nodes, segments: sampled.segments }
}
