// ── Auto-Keyframe Hub ─────────────────────────────────────────────────────────
// Central function for all property mutations coming from the UI.
// When autoKeyframe is enabled it upserts a keyframe in the timeline.
// When disabled it only updates the layer property directly.

import type { ChronoScene, AnimatableValue, Layer } from '../types'
import { upsertKeyframe } from '../timeline/keyframeOps'
import { nextKfId } from '../defaults'

interface Params {
  scene: ChronoScene
  layerId: string
  /** Dot-path relative to Layer, e.g. 'opacity', 'transform.x', 'effects.blur' */
  propertyPath: string
  timeMs: number
  value: AnimatableValue
  autoKeyframe: boolean
  timelineId: string
}

/**
 * Mutate a layer property, optionally writing a keyframe at the current time.
 *
 * Returns the updated scene — never mutates in place.
 */
export function setAnimatedPropertyValue(params: Params): ChronoScene {
  const { scene, layerId, propertyPath, timeMs, value, autoKeyframe, timelineId } = params

  // ── 1. Update the layer's static property value ──────────────────────────
  const nextScene = updateLayerProperty(scene, layerId, propertyPath, value)

  // ── 2. Upsert a keyframe if auto-keyframe is on ──────────────────────────
  if (!autoKeyframe) return nextScene

  const trackTarget = `layers.${layerId}.${propertyPath}`
  const kf = {
    id: nextKfId(),
    timeMs,
    value,
    easing: { type: 'linear' as const },
  }

  // Ensure the track exists first
  const hasTl = nextScene.timelines.find((t) => t.id === timelineId)
  if (!hasTl) return nextScene

  const hasTrack = hasTl.tracks.some((t) => t.target === trackTarget)
  const sceneWithTrack = hasTrack ? nextScene : {
    ...nextScene,
    timelines: nextScene.timelines.map((tl) =>
      tl.id !== timelineId ? tl : {
        ...tl,
        tracks: [...tl.tracks, { target: trackTarget, keyframes: [] }],
      }
    ),
  }

  return upsertKeyframe(sceneWithTrack, timelineId, trackTarget, kf)
}

// ── Property path writer ──────────────────────────────────────────────────────
// Writes a value into a nested layer property using a dot-path.
// Only handles the property paths defined in ANIMATABLE_PROPERTIES.

export function updateLayerProperty(
  scene: ChronoScene,
  layerId: string,
  propertyPath: string,
  value: AnimatableValue,
): ChronoScene {
  return {
    ...scene,
    layers: scene.layers.map((l) => {
      if (l.id !== layerId) return l
      return applyPath(l, propertyPath.split('.'), value)
    }),
  }
}

function applyPath<T extends object>(obj: T, path: string[], value: AnimatableValue): T {
  const [head, ...rest] = path
  if (rest.length === 0) {
    return { ...obj, [head]: value }
  }
  const child = (obj as Record<string, unknown>)[head] ?? {}
  return { ...obj, [head]: applyPath(child as object, rest, value) }
}
