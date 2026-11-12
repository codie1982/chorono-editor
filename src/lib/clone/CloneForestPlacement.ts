import type { ChronoScene, Layer, Track } from '../types'
import type { CloneForestOffsets } from './CloneForestTypes'
import { parseTrackTarget } from '../timeline/TrackTargetParser'

/** Ordinary numeric key channels commute with a constant parent-space offset.
 * Procedural output, modifiers and multiplier curves do not; use an explicit
 * placement parent rather than changing controller inputs or double-adding. */
export function needsClonePlacementGroup(scene: ChronoScene, root: Layer): boolean {
  if (Object.keys(root.propertyExpressions?.fields ?? {}).some(path => path.startsWith('transform.'))) return true
  if (root.motionPath || root.followPath || Object.keys(root.paramBindings ?? {}).some(key => key.startsWith('transform.'))) return true
  return scene.timelines.some(timeline => timeline.tracks.some(track => {
    const target = parseTrackTarget(track.target)
    return target?.entityId === root.id && ['transform.x', 'transform.y'].includes(target.propertyPath)
      && (!!track.controller && track.controller.type !== 'keyframe' || !!track.modifiers?.length || !!track.multiplierCurve
        || track.keyframes.some(key => typeof key.value !== 'number' || !!key.segmentModifiers?.length))
  }))
}

/** Apply a root offset to an ordinary cloned position track, retaining key IDs,
 * easing, tangent and time settings exactly. Non-position/descendant tracks are
 * returned unchanged; driven-root tracks are protected by placement groups. */
export function translateCloneTrack(track: Track, rootOffsets: CloneForestOffsets): Track {
  const target = parseTrackTarget(track.target)
  const offset = target && rootOffsets[target.entityId]
  const delta = target?.propertyPath === 'transform.x' ? offset?.x : target?.propertyPath === 'transform.y' ? offset?.y : undefined
  if (!delta) return track
  return { ...track, keyframes: track.keyframes.map(key => {
    const value = (key.value as number) + delta
    if (!Number.isFinite(value)) throw new Error('Clone placement would overflow a numeric position key.')
    return { ...key, value }
  }) }
}

/** Full parent-space placement wrapper. It deliberately has no inherited
 * opacity/effects/range; those remain on the copied root. Its original external
 * parent is preserved, and source geometry/clock is never rewritten. */
export function clonePlacementGroup(root: Layer, id: string, x: number, y: number): Layer {
  return { id, name: `${root.name} · Placement`, type: 'group', ...(root.parentId ? { parentId: root.parentId } : {}),
    transform: { x, y, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 }, opacity: 1 }
}
