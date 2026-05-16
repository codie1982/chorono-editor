// ── Snap System ───────────────────────────────────────────────────────────────
// Snap targets are built ONCE at drag start and stored in a ref.
// They are never recomputed during pointermove — that would be too expensive.

import type { Timeline, TimelineMarker } from '../types'
import type { TimelineSettings } from '../types'
import { msToFrame, frameToMs } from './coordinates'

export interface SnapResult {
  timeMs: number
  /** The snap target that was hit, or null if no snap occurred */
  snappedTo: number | null
}

/**
 * Build the set of all snap target times (ms) for the current drag operation.
 *
 * Call once at beginDrag(), store in dragRef, reuse on every pointermove.
 * Pass excludeKfId to avoid snapping a keyframe to its own original position.
 */
export function buildSnapTargets(
  timeline: Timeline,
  frameRate: number,
  settings: TimelineSettings,
  excludeKfId?: string,
): number[] {
  const targets = new Set<number>()

  // Start and end always snap
  targets.add(0)
  targets.add(timeline.durationMs)

  // Frame boundaries
  if (settings.snapToFrame && frameRate > 0) {
    const frameCount = Math.ceil((timeline.durationMs / 1000) * frameRate)
    for (let f = 0; f <= frameCount; f++) {
      targets.add(frameToMs(f, frameRate))
    }
  }

  // Existing keyframe positions (skip the dragged keyframe itself)
  if (settings.snapToKeyframes) {
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (kf.id !== excludeKfId) targets.add(kf.timeMs)
      }
    }
  }

  // Marker positions
  if (settings.snapToMarkers && timeline.markers) {
    for (const marker of timeline.markers) {
      targets.add(marker.timeMs)
    }
  }

  // Work area boundaries
  if (timeline.workAreaInMs  != null) targets.add(timeline.workAreaInMs)
  if (timeline.workAreaOutMs != null) targets.add(timeline.workAreaOutMs)

  return Array.from(targets).sort((a, b) => a - b)
}

/**
 * Snap rawMs to the nearest target within thresholdMs.
 * Holding Cmd/Ctrl (cmdHeld) bypasses snapping.
 */
export function snapToTargets(
  rawMs: number,
  targets: number[],
  cmdHeld: boolean,
  thresholdMs = 8,
): SnapResult {
  if (cmdHeld || targets.length === 0) {
    return { timeMs: rawMs, snappedTo: null }
  }

  let closest = Infinity
  let snappedTo: number | null = null

  for (const t of targets) {
    const dist = Math.abs(rawMs - t)
    if (dist < closest && dist <= thresholdMs) {
      closest = dist
      snappedTo = t
    }
  }

  return { timeMs: snappedTo ?? rawMs, snappedTo }
}
