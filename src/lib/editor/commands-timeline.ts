// ── Timeline Commands ─────────────────────────────────────────────────────────

import type { ChronoScene, Timeline, TimelineMarker, TimelineEvent } from '../types'
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

// ── Timeline layer membership ─────────────────────────────────────────────────

/** Add a layer to a timeline's explicit layer list (opt-in model). */
export function makeAddLayerToTimelineCmd(timelineId: string, layerId: string): EditorCommand {
  return {
    label: 'Add Layer to Timeline',
    execute: (scene) => ({
      ...scene,
      timelines: scene.timelines.map((t) => {
        if (t.id !== timelineId) return t
        const ids = t.layerIds ?? []
        if (ids.includes(layerId)) return t
        return { ...t, layerIds: [...ids, layerId] }
      }),
    }),
    undo: (scene) => ({
      ...scene,
      timelines: scene.timelines.map((t) => {
        if (t.id !== timelineId) return t
        const ids = t.layerIds
        if (!ids) return t
        return { ...t, layerIds: ids.filter((id) => id !== layerId) }
      }),
    }),
  }
}

/** Remove a layer from a timeline's explicit layer list. */
export function makeRemoveLayerFromTimelineCmd(timelineId: string, layerId: string): EditorCommand {
  return {
    label: 'Remove Layer from Timeline',
    execute: (scene) => ({
      ...scene,
      timelines: scene.timelines.map((t) => {
        if (t.id !== timelineId) return t
        const ids = t.layerIds
        if (!ids) return t
        return { ...t, layerIds: ids.filter((id) => id !== layerId) }
      }),
    }),
    undo: (scene) => ({
      ...scene,
      timelines: scene.timelines.map((t) => {
        if (t.id !== timelineId) return t
        const ids = t.layerIds ?? []
        if (ids.includes(layerId)) return t
        return { ...t, layerIds: [...ids, layerId] }
      }),
    }),
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

// ── Markers (BL-11) ───────────────────────────────────────────────────────────

function mapTimelineMarkers(
  scene: ChronoScene,
  timelineId: string,
  fn: (markers: TimelineMarker[]) => TimelineMarker[],
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((t) =>
      t.id !== timelineId ? t : { ...t, markers: fn(t.markers ?? []) }
    ),
  }
}

export function makeAddMarkerCmd(timelineId: string, marker: TimelineMarker): EditorCommand {
  return {
    label: 'Add Marker',
    execute: (scene) => mapTimelineMarkers(scene, timelineId, (ms) => [...ms, marker]),
    undo: (scene) => mapTimelineMarkers(scene, timelineId, (ms) => ms.filter((m) => m.id !== marker.id)),
  }
}

export function makeDeleteMarkerCmd(timelineId: string, marker: TimelineMarker): EditorCommand {
  return {
    label: 'Delete Marker',
    execute: (scene) => mapTimelineMarkers(scene, timelineId, (ms) => ms.filter((m) => m.id !== marker.id)),
    undo: (scene) => mapTimelineMarkers(scene, timelineId, (ms) => [...ms, marker]),
  }
}

export function makeUpdateMarkerCmd(
  timelineId: string,
  markerId: string,
  prev: Pick<TimelineMarker, 'label' | 'color'>,
  next: Pick<TimelineMarker, 'label' | 'color'>,
): EditorCommand {
  return {
    label: `Update Marker: ${next.label}`,
    execute: (scene) =>
      mapTimelineMarkers(scene, timelineId, (ms) =>
        ms.map((m) => (m.id !== markerId ? m : { ...m, ...next }))
      ),
    undo: (scene) =>
      mapTimelineMarkers(scene, timelineId, (ms) =>
        ms.map((m) => (m.id !== markerId ? m : { ...m, ...prev }))
      ),
  }
}

/** Move-marker command (BL-11) — separate from update so drag commits aren't
 *  conflated with rename/color edits in the undo stack. */
export function makeMoveMarkerCmd(
  timelineId: string,
  markerId: string,
  fromMs: number,
  toMs: number,
): EditorCommand {
  return {
    label: 'Move Marker',
    execute: (scene) =>
      mapTimelineMarkers(scene, timelineId, (ms) =>
        ms.map((m) => (m.id !== markerId ? m : { ...m, timeMs: toMs }))
      ),
    undo: (scene) =>
      mapTimelineMarkers(scene, timelineId, (ms) =>
        ms.map((m) => (m.id !== markerId ? m : { ...m, timeMs: fromMs }))
      ),
  }
}

// ── Events (BL-36) ───────────────────────────────────────────────────────────

function mapTimelineEvents(
  scene: ChronoScene,
  timelineId: string,
  fn: (events: TimelineEvent[]) => TimelineEvent[],
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((t) =>
      t.id !== timelineId ? t : { ...t, events: fn(t.events ?? []) }
    ),
  }
}

export function makeAddEventCmd(timelineId: string, event: TimelineEvent): EditorCommand {
  return {
    label: `Add Event: ${event.name}`,
    execute: (s) => mapTimelineEvents(s, timelineId, (es) => [...es, event].sort((a, b) => a.timeMs - b.timeMs)),
    undo:    (s) => mapTimelineEvents(s, timelineId, (es) => es.filter((e) => e.id !== event.id)),
  }
}

export function makeDeleteEventCmd(timelineId: string, event: TimelineEvent): EditorCommand {
  return {
    label: `Delete Event: ${event.name}`,
    execute: (s) => mapTimelineEvents(s, timelineId, (es) => es.filter((e) => e.id !== event.id)),
    undo:    (s) => mapTimelineEvents(s, timelineId, (es) => [...es, event].sort((a, b) => a.timeMs - b.timeMs)),
  }
}

export function makeUpdateEventCmd(
  timelineId: string, eventId: string,
  prev: Pick<TimelineEvent, 'name' | 'timeMs' | 'payload'>,
  next: Pick<TimelineEvent, 'name' | 'timeMs' | 'payload'>,
): EditorCommand {
  return {
    label: `Update Event: ${next.name}`,
    execute: (s) => mapTimelineEvents(s, timelineId, (es) =>
      es.map((e) => e.id !== eventId ? e : { ...e, ...next }).sort((a, b) => a.timeMs - b.timeMs)),
    undo: (s) => mapTimelineEvents(s, timelineId, (es) =>
      es.map((e) => e.id !== eventId ? e : { ...e, ...prev }).sort((a, b) => a.timeMs - b.timeMs)),
  }
}
