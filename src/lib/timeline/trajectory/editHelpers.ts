import type { ChronoScene, Keyframe, Track } from '../../types'
import { nextKfId } from '../../defaults'
import { insertCurveKeyframe } from '../curveEditing'
import { prepareTrajectoryContext } from './capabilities'
import type { TrajectoryContext } from './types'
import type { TrajectoryCommandScope, TrajectoryNodeRef } from './commandTypes'
import type { TrajectoryKeyIdAllocator } from './keyIds'

export const TRAJECTORY_EDIT_LIMITS = { nodes: 2048, drawPoints: 128 } as const

/** Resolve the actual layer/timeline and refuse driven output before preparing
 * any key replacement. Parent-time projection remains in the frame module. */
export function editableTrajectory(scene: ChronoScene, scope: TrajectoryCommandScope): TrajectoryContext {
  const prepared = prepareTrajectoryContext(scene, scope.timelineId, scope.layerId)
  if (!prepared.ok) throw new Error(prepared.diagnostics.map(value => value.message).join(' '))
  if (!prepared.context.capability.editable) throw new Error(prepared.context.capability.diagnostics.map(value => value.message).join(' '))
  return prepared.context
}

/** Validate timeline-local source time. No project-time wrapping or rounding is
 * implicit: exact keys at the duration endpoint remain addressable. */
export function requireTrajectoryTime(context: TrajectoryContext, timeMs: number): void {
  if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > context.timeline.durationMs) {
    throw new Error('Position key time must be finite and inside the selected timeline duration.')
  }
}

/** Resolve exact key IDs from caller selection, rejecting stale or cross-axis
 * addresses. Duplicate node refs at the same time merge without duplicate edits. */
export function trajectoryNodeRefs(context: TrajectoryContext, refs: readonly TrajectoryNodeRef[]): TrajectoryNodeRef[] {
  if (!refs.length || refs.length > TRAJECTORY_EDIT_LIMITS.nodes) throw new Error(`Select 1–${TRAJECTORY_EDIT_LIMITS.nodes} position nodes.`)
  const nodes = new Map<number, TrajectoryNodeRef>()
  for (const ref of refs) {
    requireTrajectoryTime(context, ref.timeMs)
    if (!ref.xKeyId && !ref.yKeyId) throw new Error('A selected position node must reference an x or y key ID.')
    const merged = { ...nodes.get(ref.timeMs), timeMs: ref.timeMs }
    for (const axis of ['x', 'y'] as const) {
      const id = axis === 'x' ? ref.xKeyId : ref.yKeyId
      if (!id) continue
      const track = axis === 'x' ? context.xTrack : context.yTrack
      const key = track?.keyframes.find(value => value.id === id)
      if (!key || key.timeMs !== ref.timeMs) {
        throw new Error('The selected position key changed. Read the current trajectory and select it again.')
      }
      const property = axis === 'x' ? 'xKeyId' : 'yKeyId'
      if (merged[property] && merged[property] !== id) throw new Error('Conflicting key IDs address the same position time.')
      merged[property] = id
    }
    nodes.set(ref.timeMs, merged)
  }
  return Array.from(nodes.values()).sort((a, b) => a.timeMs - b.timeMs)
}

/** Directly selected key IDs only; support keys never become selected silently. */
export function trajectorySelectedIds(nodes: readonly TrajectoryNodeRef[]): string[] {
  return Array.from(new Set(nodes.flatMap(node => [node.xKeyId, node.yKeyId].filter((id): id is string => !!id))))
}

export interface PositionKeyWrite { track: Track; selectedId: string; supportIds: string[]; diagnostics: string[] }

/** Update an exact source key without replacing its metadata, or insert through
 * the canonical shape-preserving curve splitter before changing its value.
 * Arrays/track settings are immutable; keys within ±1 ms remain protected.
 * Sparse/empty channels get a native linear key, never evaluated driver output. */
export function writePositionKey(track: Track | undefined, target: string, timeMs: number, value: number,
  keyId?: TrajectoryKeyIdAllocator): PositionKeyWrite {
  if (!Number.isFinite(value)) throw new Error('Position key values must be finite.')
  const original = track ?? { target, keyframes: [] }
  const nearby = original.keyframes.filter(key => Math.abs(key.timeMs - timeMs) <= 1)
  const exact = nearby.find(key => key.timeMs === timeMs)
  if (nearby.length && (!exact || nearby.length > 1)) throw new Error('A nearby position key would collide with this edit; select its exact time first.')
  if (exact) return { track: exact.value === value ? original : { ...original,
    keyframes: original.keyframes.map(key => key.id === exact.id ? { ...key, value } : key) },
    selectedId: exact.id, supportIds: [], diagnostics: [] }
  if (!original.keyframes.length) {
    const key: Keyframe = { id: keyId?.({ target, timeMs, role: 'node' }) ?? nextKfId(), timeMs, value, easing: { type: 'linear' } }
    return { track: { ...original, keyframes: [key] }, selectedId: key.id, supportIds: [], diagnostics: [] }
  }
  const insertion = insertCurveKeyframe(original, timeMs, nextKfId, { roundTimeMs: false,
    ...(keyId ? { idForTime: (insertedTime: number) => keyId({ target, timeMs: insertedTime,
      role: insertedTime === timeMs ? 'node' : 'support' }) } : {}) })
  if (!insertion.ok) throw new Error(insertion.reason)
  const inserted = insertion.track.keyframes.find(key => key.timeMs === timeMs)
  if (!inserted) throw new Error('The curve splitter could not preserve this exact position-key time.')
  return { track: inserted.value === value ? insertion.track : { ...insertion.track,
    keyframes: insertion.track.keyframes.map(key => key.id === inserted.id ? { ...key, value } : key) },
    selectedId: inserted.id, supportIds: insertion.insertedIds.filter(id => id !== inserted.id),
    diagnostics: insertion.message ? [insertion.message] : [] }
}
