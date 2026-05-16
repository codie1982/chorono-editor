// ── Lifecycle Emitter ─────────────────────────────────────────────────────────
// Diffs two playback snapshots and produces RuntimeEvents (animationStart,
// segmentComplete, markerReached, …) representing the transitions that
// happened in the gap. Pure function — the hook handles state.

import type { ChronoScene, Timeline } from '../types'
import type { RuntimeEvent } from './triggerEngine'

export interface PlaybackSnapshot {
  timeMs:               number
  isPlaying:            boolean
  activeSegmentId:      string | null
  activeTimelineId:     string | null
  /** Set of layer ids currently inside their [startMs, endMs] window. */
  visibleLayerIds:      ReadonlySet<string>
  /** Active timeline's loop iteration count (resets on stop). */
  loopCount:            number
}

export function emptySnapshot(): PlaybackSnapshot {
  return {
    timeMs: 0,
    isPlaying: false,
    activeSegmentId:  null,
    activeTimelineId: null,
    visibleLayerIds:  new Set<string>(),
    loopCount: 0,
  }
}

/**
 * Compare previous and next snapshots and emit the lifecycle events that
 * correspond to the diff. Returned events are intended to be merged with
 * any externally-fired events (button click, customEvent) before being
 * passed to the trigger engine.
 */
export function detectLifecycleEvents(
  scene: ChronoScene,
  prev: PlaybackSnapshot,
  next: PlaybackSnapshot,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = []

  // ── Playback start / loop ───────────────────────────────────────────────
  if (!prev.isPlaying && next.isPlaying) {
    events.push({ type: 'animationStart', timelineId: next.activeTimelineId ?? undefined })
  }

  if (next.loopCount > prev.loopCount && next.activeTimelineId) {
    events.push({
      type: 'animationLoop',
      timelineId: next.activeTimelineId,
    })
  }

  // ── Animation complete (per active timeline) ────────────────────────────
  if (next.activeTimelineId) {
    const tl = scene.timelines.find((t) => t.id === next.activeTimelineId)
    if (tl) {
      const crossedEnd = prev.timeMs < tl.durationMs && next.timeMs >= tl.durationMs
      // Non-loop timelines emit a single animationComplete.
      // Loop timelines never emit it (use animationLoop instead).
      if (crossedEnd && !tl.loop) {
        events.push({ type: 'animationComplete', timelineId: tl.id })
      }
    }
  }

  // ── Segment lifecycle ───────────────────────────────────────────────────
  if (prev.activeSegmentId !== next.activeSegmentId) {
    if (prev.activeSegmentId) {
      events.push({ type: 'segmentComplete', segmentId: prev.activeSegmentId })
    }
    if (next.activeSegmentId) {
      events.push({ type: 'segmentStart', segmentId: next.activeSegmentId })
    }
  }

  // ── Layer appear / disappear ────────────────────────────────────────────
  next.visibleLayerIds.forEach((layerId) => {
    if (!prev.visibleLayerIds.has(layerId)) {
      events.push({ type: 'layerAppear', layerId })
    }
  })
  prev.visibleLayerIds.forEach((layerId) => {
    if (!next.visibleLayerIds.has(layerId)) {
      events.push({ type: 'layerDisappear', layerId })
    }
  })

  // ── Per-layer animation complete (last keyframe crossed) ────────────────
  // We approximate this as the moment we cross the layer's effective endMs
  // OR — when no endMs is set — the moment we cross the latest keyframe time
  // among that layer's tracks. Cheap heuristic that matches authored intent.
  const tlForLayers = next.activeTimelineId
    ? scene.timelines.find((t) => t.id === next.activeTimelineId)
    : null
  if (tlForLayers) {
    for (const layer of scene.layers) {
      const lastTime = layerLastKeyframeTime(tlForLayers, layer.id)
      if (lastTime == null) continue
      if (prev.timeMs < lastTime && next.timeMs >= lastTime) {
        events.push({ type: 'layerAnimationComplete', layerId: layer.id })
      }
    }
  }

  // ── Marker reached ──────────────────────────────────────────────────────
  if (tlForLayers?.markers) {
    for (const marker of tlForLayers.markers) {
      if (prev.timeMs < marker.timeMs && next.timeMs >= marker.timeMs) {
        events.push({ type: 'markerReached', refId: marker.id })
      }
    }
  }

  // ── Frame reached ───────────────────────────────────────────────────────
  // Emit once per integer-frame boundary crossed. Listeners can filter by
  // event.frameNumber if they care about a specific frame.
  if (next.isPlaying && next.activeTimelineId) {
    const tl = tlForLayers
    if (tl) {
      const frameMs = 1000 / Math.max(1, scene.composition.frameRate)
      const prevFrame = Math.floor(prev.timeMs / frameMs)
      const nextFrame = Math.floor(next.timeMs / frameMs)
      // Cap to avoid flooding when seeking large gaps.
      const span = Math.min(nextFrame - prevFrame, 240)
      for (let i = 1; i <= span; i++) {
        events.push({ type: 'frameReached', frameNumber: prevFrame + i })
      }
    }
  }

  return events
}

function layerLastKeyframeTime(timeline: Timeline, layerId: string): number | null {
  let last: number | null = null
  const prefix = `layers.${layerId}.`
  for (const track of timeline.tracks) {
    if (!track.target.startsWith(prefix)) continue
    const t = track.keyframes[track.keyframes.length - 1]?.timeMs
    if (t != null && (last == null || t > last)) last = t
  }
  return last
}

/**
 * Helper to compute the set of currently-visible layer ids for a given
 * global time. A layer is "visible" when timeMs ∈ [startMs ?? 0, endMs ?? ∞)
 * AND the layer isn't editor-hidden.
 */
export function computeVisibleLayerIds(
  scene: ChronoScene,
  timeMs: number,
): Set<string> {
  const result = new Set<string>()
  for (const layer of scene.layers) {
    if (layer.hidden) continue
    const start = layer.startMs ?? 0
    const end   = layer.endMs   ?? Number.POSITIVE_INFINITY
    if (timeMs >= start && timeMs < end) result.add(layer.id)
  }
  return result
}
