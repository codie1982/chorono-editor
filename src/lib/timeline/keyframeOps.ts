// ── Keyframe Operations ───────────────────────────────────────────────────────
// Pure functions that return new ChronoScene values — no side effects.
// Used by editor commands (commands-keyframe.ts) and auto-keyframe logic.

import { sameKeyTime, compareKeyTime } from './authoring/keyTimePolicy'
import type { ChronoScene, Keyframe, EasingDefinition, AnimatableValue } from '../types'

// ── Internal helper ───────────────────────────────────────────────────────────

function mapTimeline(
  scene: ChronoScene,
  timelineId: string,
  trackTarget: string,
  mapKfs: (kfs: Keyframe[]) => Keyframe[],
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((tl) =>
      tl.id !== timelineId ? tl : {
        ...tl,
        tracks: tl.tracks.map((t) =>
          t.target !== trackTarget ? t : { ...t, keyframes: mapKfs(t.keyframes) }
        ),
      }
    ),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Low-level immutable insertion. Callers validate bounds and collisions via
 * the authoring batch contract; this primitive also supports transient previews. */
export function insertKf(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  kf: Keyframe,
): ChronoScene {
  return mapTimeline(scene, timelineId, target, (kfs) =>
    [...kfs, kf].sort(compareKeyTime)
  )
}

/** Remove a keyframe by its stable UUID. */
export function removeKf(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  kfId: string,
): ChronoScene {
  return mapTimeline(scene, timelineId, target, (kfs) =>
    kfs.filter((k) => k.id !== kfId)
  )
}

/** Move a keyframe to a new time, re-sorting the array. */
export function updateKfTimeMs(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  kfId: string,
  newMs: number,
): ChronoScene {
  return mapTimeline(scene, timelineId, target, (kfs) =>
    kfs.map((k) => k.id === kfId ? { ...k, timeMs: newMs } : k)
      .sort(compareKeyTime)
  )
}

/** Replace the value carried by a keyframe (without moving it in time). */
export function updateKfValue(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  kfId: string,
  newValue: AnimatableValue,
): ChronoScene {
  return mapTimeline(scene, timelineId, target, (kfs) =>
    kfs.map((k) => k.id === kfId ? { ...k, value: newValue } : k)
  )
}

/** Replace the easing definition on a keyframe. */
export function updateKfEasing(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  kfId: string,
  easing: EasingDefinition,
): ChronoScene {
  return mapTimeline(scene, timelineId, target, (kfs) =>
    kfs.map((k) => k.id === kfId ? { ...k, easing,
      ...(k.tangentMode === 'linear' && easing.type !== 'linear' ? { tangentMode: 'broken' as const } : {}),
    } : k)
  )
}

/**
 * Ensure a layer appears in a timeline's explicit layerIds list so its tracks
 * render in the dope sheet (B4). layerIds semantics:
 *   undefined → "show all" — left untouched (layer is already visible).
 *   array     → append layerId if absent (idempotent).
 */
export function ensureLayerInTimeline(
  scene: ChronoScene,
  timelineId: string,
  layerId: string,
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((tl) => {
      if (tl.id !== timelineId) return tl
      if (!Array.isArray(tl.layerIds)) return tl
      if (tl.layerIds.includes(layerId)) return tl
      return { ...tl, layerIds: [...tl.layerIds, layerId] }
    }),
  }
}

/** Exact-time source upsert. Updates preserve the existing stable ID, time and
 * unspecified tangent/segment data. Easing is preserved unless explicitly
 * requested. Neighbouring sub-ms keys are distinct; ambiguous coincident keys
 * throw instead of deleting several. Existing authoring callers need not sort
 * or implement a second tolerance policy. New key values remain caller-owned.
 */
export function upsertKeyframe(scene: ChronoScene, timelineId: string, target: string,
  kf: Keyframe, options: { updateEasing?: boolean } = {}): ChronoScene {
  if (!Number.isFinite(kf.timeMs) || kf.timeMs < 0) throw new Error('Key time must be finite and non-negative.')
  return mapTimeline(scene, timelineId, target, keys => {
    const matching = keys.filter(key => sameKeyTime(key.timeMs, kf.timeMs))
    if (matching.length > 1) throw new Error('Multiple keys share this time. Resolve the collision before updating.')
    if (matching.length) {
      const existing = matching[0]
      return keys.map(key => key.id === existing.id ? { ...existing, ...kf, id: existing.id, timeMs: existing.timeMs,
        easing: options.updateEasing ? kf.easing : existing.easing } : key).sort(compareKeyTime)
    }
    if (keys.some(key => key.id === kf.id)) throw new Error('Key identity already exists at another time.')
    return [...keys, kf].sort(compareKeyTime)
  })
}
