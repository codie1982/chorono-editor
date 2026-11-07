// ── Keyframe Operations ───────────────────────────────────────────────────────
// Pure functions that return new ChronoScene values — no side effects.
// Used by editor commands (commands-keyframe.ts) and auto-keyframe logic.

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

/** Insert a keyframe (caller must ensure no duplicate timeMs ± 1ms). */
export function insertKf(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  kf: Keyframe,
): ChronoScene {
  return mapTimeline(scene, timelineId, target, (kfs) =>
    [...kfs, kf].sort((a, b) => a.timeMs - b.timeMs)
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
      .sort((a, b) => a.timeMs - b.timeMs)
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

/**
 * Insert or replace a keyframe.
 * If a keyframe within 1 ms of kf.timeMs already exists, replace it.
 * Otherwise insert and sort.
 */
export function upsertKeyframe(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  kf: Keyframe,
): ChronoScene {
  return mapTimeline(scene, timelineId, target, (kfs) => {
    const filtered = kfs.filter((k) => Math.abs(k.timeMs - kf.timeMs) > 1)
    return [...filtered, kf].sort((a, b) => a.timeMs - b.timeMs)
  })
}
