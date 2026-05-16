// ── Interactive Runtime Commands ──────────────────────────────────────────────
// CRUD commands for Parameters, Triggers, Bindings and Segments. All follow
// the EditorCommand pattern (pure execute/undo on the scene tree) so they
// participate in the standard undo/redo stack.

import type {
  ChronoScene, SceneParameter,
  Trigger, Binding, TimelineSegment, Timeline,
} from '../types'
import type { EditorCommand } from './commands-keyframe'

// ─────────────────────────────────────────────────────────────────────────────
// Scene Parameters
// ─────────────────────────────────────────────────────────────────────────────

export function makeAddParamCmd(param: SceneParameter): EditorCommand {
  return {
    label: `Add Parameter "${param.name}"`,
    execute: (scene) => ({ ...scene, parameters: [...scene.parameters, param] }),
    undo:    (scene) => ({ ...scene, parameters: scene.parameters.filter((p) => p.id !== param.id) }),
  }
}

export function makeDeleteParamCmd(param: SceneParameter): EditorCommand {
  return {
    label: `Delete Parameter "${param.name}"`,
    execute: (scene) => ({ ...scene, parameters: scene.parameters.filter((p) => p.id !== param.id) }),
    undo:    (scene) => ({ ...scene, parameters: [...scene.parameters, param] }),
  }
}

export function makeUpdateParamCmd(
  paramId: string,
  prev: SceneParameter,
  next: SceneParameter,
): EditorCommand {
  return {
    label: `Update Parameter "${prev.name}"`,
    execute: (scene) => ({
      ...scene,
      parameters: scene.parameters.map((p) => p.id === paramId ? next : p),
    }),
    undo: (scene) => ({
      ...scene,
      parameters: scene.parameters.map((p) => p.id === paramId ? prev : p),
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Triggers
// ─────────────────────────────────────────────────────────────────────────────

export function makeAddTriggerCmd(trigger: Trigger): EditorCommand {
  return {
    label: `Add Trigger ${trigger.label ?? trigger.id}`,
    execute: (scene) => ({ ...scene, triggers: [...scene.triggers, trigger] }),
    undo:    (scene) => ({ ...scene, triggers: scene.triggers.filter((t) => t.id !== trigger.id) }),
  }
}

export function makeDeleteTriggerCmd(trigger: Trigger): EditorCommand {
  return {
    label: `Delete Trigger ${trigger.label ?? trigger.id}`,
    execute: (scene) => ({ ...scene, triggers: scene.triggers.filter((t) => t.id !== trigger.id) }),
    undo:    (scene) => ({ ...scene, triggers: [...scene.triggers, trigger] }),
  }
}

export function makeUpdateTriggerCmd(
  triggerId: string,
  prev: Trigger,
  next: Trigger,
): EditorCommand {
  return {
    label: `Update Trigger ${prev.label ?? prev.id}`,
    execute: (scene) => ({
      ...scene,
      triggers: scene.triggers.map((t) => t.id === triggerId ? next : t),
    }),
    undo: (scene) => ({
      ...scene,
      triggers: scene.triggers.map((t) => t.id === triggerId ? prev : t),
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bindings
// ─────────────────────────────────────────────────────────────────────────────

export function makeAddBindingCmd(binding: Binding): EditorCommand {
  return {
    label: 'Add Binding',
    execute: (scene) => ({ ...scene, bindings: [...scene.bindings, binding] }),
    undo:    (scene) => ({ ...scene, bindings: scene.bindings.filter((b) => b.id !== binding.id) }),
  }
}

export function makeDeleteBindingCmd(binding: Binding): EditorCommand {
  return {
    label: 'Delete Binding',
    execute: (scene) => ({ ...scene, bindings: scene.bindings.filter((b) => b.id !== binding.id) }),
    undo:    (scene) => ({ ...scene, bindings: [...scene.bindings, binding] }),
  }
}

export function makeUpdateBindingCmd(
  bindingId: string,
  prev: Binding,
  next: Binding,
): EditorCommand {
  return {
    label: 'Update Binding',
    execute: (scene) => ({
      ...scene,
      bindings: scene.bindings.map((b) => b.id === bindingId ? next : b),
    }),
    undo: (scene) => ({
      ...scene,
      bindings: scene.bindings.map((b) => b.id === bindingId ? prev : b),
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Segments
// ─────────────────────────────────────────────────────────────────────────────

function patchTimeline(
  scene: ChronoScene,
  timelineId: string,
  mutate: (segments: TimelineSegment[]) => TimelineSegment[],
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((t: Timeline) =>
      t.id === timelineId ? { ...t, segments: mutate(t.segments ?? []) } : t,
    ),
  }
}

export function makeAddSegmentCmd(
  timelineId: string,
  segment: TimelineSegment,
): EditorCommand {
  return {
    label: `Add Segment "${segment.name}"`,
    execute: (scene) => patchTimeline(scene, timelineId, (segs) => [...segs, segment]),
    undo:    (scene) => patchTimeline(scene, timelineId, (segs) => segs.filter((s) => s.id !== segment.id)),
  }
}

export function makeDeleteSegmentCmd(
  timelineId: string,
  segment: TimelineSegment,
): EditorCommand {
  return {
    label: `Delete Segment "${segment.name}"`,
    execute: (scene) => patchTimeline(scene, timelineId, (segs) => segs.filter((s) => s.id !== segment.id)),
    undo:    (scene) => patchTimeline(scene, timelineId, (segs) => [...segs, segment]),
  }
}

export function makeUpdateSegmentCmd(
  timelineId: string,
  prev: TimelineSegment,
  next: TimelineSegment,
): EditorCommand {
  return {
    label: `Update Segment "${prev.name}"`,
    execute: (scene) => patchTimeline(scene, timelineId, (segs) =>
      segs.map((s) => s.id === prev.id ? next : s)),
    undo:    (scene) => patchTimeline(scene, timelineId, (segs) =>
      segs.map((s) => s.id === prev.id ? prev : s)),
  }
}
