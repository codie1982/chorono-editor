// ── Timeline Commands ─────────────────────────────────────────────────────────

import type { ChronoScene, Timeline, TimelineMarker } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { newTimeline } from '../defaults'

// ── Add timeline ──────────────────────────────────────────────────────────────

export function makeAddTimelineCmd(tl: Timeline = newTimeline()): EditorCommand {
  return {
    label: 'Add Timeline',
    execute: (scene) => ({ ...scene, timelines: [...scene.timelines, tl] }),
    undo:    (scene) => ({ ...scene, timelines: scene.timelines.filter((t) => t.id !== tl.id) }),
  }
}

// ── Delete timeline ───────────────────────────────────────────────────────────

export function makeDeleteTimelineCmd(tl: Timeline): EditorCommand {
  return {
    label: 'Delete Timeline',
    execute: (scene) => ({ ...scene, timelines: scene.timelines.filter((t) => t.id !== tl.id) }),
    undo:    (scene) => ({ ...scene, timelines: [...scene.timelines, tl] }),
  }
}

// ── Work area ─────────────────────────────────────────────────────────────────

export function makeSetWorkAreaCmd(
  timelineId: string,
  prevIn: number | undefined,
  prevOut: number | undefined,
  nextIn: number | undefined,
  nextOut: number | undefined,
): EditorCommand {
  function apply(scene: ChronoScene, inMs: number | undefined, outMs: number | undefined): ChronoScene {
    return {
      ...scene,
      timelines: scene.timelines.map((t) =>
        t.id !== timelineId ? t : { ...t, workAreaInMs: inMs, workAreaOutMs: outMs }
      ),
    }
  }
  return {
    label: 'Set Work Area',
    execute: (scene) => apply(scene, nextIn, nextOut),
    undo:    (scene) => apply(scene, prevIn, prevOut),
  }
}

// ── Add marker ────────────────────────────────────────────────────────────────

export function makeAddMarkerCmd(timelineId: string, marker: TimelineMarker): EditorCommand {
  return {
    label: 'Add Marker',
    execute: (scene) => ({
      ...scene,
      timelines: scene.timelines.map((t) =>
        t.id !== timelineId ? t : { ...t, markers: [...(t.markers ?? []), marker] }
      ),
    }),
    undo: (scene) => ({
      ...scene,
      timelines: scene.timelines.map((t) =>
        t.id !== timelineId ? t : { ...t, markers: (t.markers ?? []).filter((m) => m.id !== marker.id) }
      ),
    }),
  }
}
