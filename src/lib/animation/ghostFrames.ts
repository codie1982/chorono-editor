/**
 * Ghost/Onion Skin Frame Interpolation
 *
 * For timeline playhead-relative ghost rendering:
 * Given a layer and current time, compute interpolated frames
 * at N-frame intervals before/after the playhead.
 */

import type { Layer, Timeline, Track, Keyframe, Transform } from '@/lib/types'
import { evaluateTrack } from '@/lib/evaluator'

export interface GhostFrame {
  /** Frame number (frame = timeMs / (1000/fps)) */
  frameNumber: number
  /** Time in milliseconds */
  timeMs: number
  /** Layer ID */
  layerId: string
  /** Interpolated transform at this frame */
  transform?: Transform
  /** Interpolated opacity at this frame */
  opacity?: number
  /** Whether this frame is before (true) or after (false) playhead */
  isBefore: boolean
}

/**
 * Compute ghost frames for a layer within the given time range.
 *
 * @param layer The layer to compute ghost frames for
 * @param timeline The timeline containing keyframe tracks
 * @param currentTimeMs Current playhead position (ms)
 * @param beforeFrames How many frames before playhead to include
 * @param afterFrames How many frames after playhead to include
 * @param fps Frame rate (default 30 fps, so 1 frame = 33.33ms)
 * @returns Array of GhostFrame objects (sorted by time)
 */
export function getGhostFrames(
  layer: Layer,
  timeline: Timeline | null,
  currentTimeMs: number,
  beforeFrames: number,
  afterFrames: number,
  fps: number = 30,
): GhostFrame[] {
  if (!timeline) return []

  const frameMs = 1000 / fps // e.g., 33.33 ms per frame at 30 fps
  const frames: GhostFrame[] = []

  // Compute time range for ghost frames
  const startTimeMs = Math.max(0, currentTimeMs - beforeFrames * frameMs)
  const endTimeMs = currentTimeMs + afterFrames * frameMs

  // Iterate each frame in the range
  for (let i = 1; i <= beforeFrames; i++) {
    const timeMs = currentTimeMs - i * frameMs
    if (timeMs < 0) break
    frames.push(computeFrameAtTime(layer, timeline, timeMs, true))
  }

  for (let i = 1; i <= afterFrames; i++) {
    const timeMs = currentTimeMs + i * frameMs
    frames.push(computeFrameAtTime(layer, timeline, timeMs, false))
  }

  return frames.sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * Compute interpolated values for a single ghost frame.
 */
function computeFrameAtTime(
  layer: Layer,
  timeline: Timeline,
  timeMs: number,
  isBefore: boolean,
): GhostFrame {
  // Find tracks for this layer
  const layerPrefix = `layers.${layer.id}.`
  const tracks = timeline.tracks.filter((t) => t.target.startsWith(layerPrefix))

  // Interpolate each track at timeMs
  let transform = structuredClone(layer.transform) // default transform
  let opacity = layer.opacity

  for (const track of tracks) {
    const value = evaluateTrack(track, timeMs)
    if (value === undefined) continue

    // Map track path to layer property
    const path = track.target.substring(layerPrefix.length)
    if (path.startsWith('transform.')) {
      const field = path.substring('transform.'.length) as keyof Transform
      if (field in transform) {
        ;(transform as any)[field] = value
      }
    } else if (path === 'opacity') {
      opacity = value
    }
  }

  const frameNumber = Math.round(timeMs / (1000 / 30)) // normalized to 30 fps frame number
  return {
    frameNumber,
    timeMs,
    layerId: layer.id,
    transform,
    opacity,
    isBefore,
  }
}

/**
 * For multi-layer ghost rendering, collect all ghost frames
 * across selected or all animated layers.
 */
export function getMultiLayerGhostFrames(
  layers: Layer[],
  timeline: Timeline | null,
  currentTimeMs: number,
  beforeFrames: number,
  afterFrames: number,
  scope: 'all' | 'selected',
  selectedLayerIds?: Set<string>,
  fps: number = 30,
): GhostFrame[] {
  if (!timeline) return []

  const targetLayers =
    scope === 'selected' && selectedLayerIds
      ? layers.filter((l) => selectedLayerIds.has(l.id))
      : layers

  // Only include animated layers (those with tracks)
  const animatedLayers = targetLayers.filter((l) =>
    timeline.tracks.some((t) => t.target.startsWith(`layers.${l.id}.`))
  )

  // Collect all ghost frames
  const allFrames: GhostFrame[] = []
  for (const layer of animatedLayers) {
    const frameList = getGhostFrames(
      layer,
      timeline,
      currentTimeMs,
      beforeFrames,
      afterFrames,
      fps,
    )
    allFrames.push(...frameList)
  }

  return allFrames
}
