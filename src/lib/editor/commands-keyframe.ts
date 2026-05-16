// ── Keyframe Commands ─────────────────────────────────────────────────────────
// Factory functions that return EditorCommand objects.
// Each command carries both execute() and undo() so history can reverse it.

import type { ChronoScene, Keyframe, Layer, Track, EasingDefinition, AnimatableValue } from '../types'
import {
  insertKf, removeKf, updateKfTimeMs, updateKfValue, updateKfEasing, upsertKeyframe,
} from '../timeline/keyframeOps'
import { nextKfId } from '../defaults'

export interface EditorCommand {
  /** Human-readable label shown in undo history (e.g. "Move Keyframe") */
  label: string
  execute(scene: ChronoScene): ChronoScene
  undo(scene: ChronoScene): ChronoScene
}

// ── Add keyframe ──────────────────────────────────────────────────────────────

export function makeAddKfCmd(
  timelineId: string,
  target: string,
  kf: Keyframe,
): EditorCommand {
  return {
    label: 'Add Keyframe',
    execute: (scene) => upsertKeyframe(scene, timelineId, target, kf),
    undo:    (scene) => removeKf(scene, timelineId, target, kf.id),
  }
}

// ── Delete keyframe ───────────────────────────────────────────────────────────

export function makeDeleteKfCmd(
  timelineId: string,
  target: string,
  kf: Keyframe,
): EditorCommand {
  return {
    label: 'Delete Keyframe',
    execute: (scene) => removeKf(scene, timelineId, target, kf.id),
    undo:    (scene) => upsertKeyframe(scene, timelineId, target, kf),
  }
}

// ── Move keyframe ─────────────────────────────────────────────────────────────

export function makeMoveKfCmd(
  timelineId: string,
  target: string,
  kfId: string,
  fromMs: number,
  toMs: number,
): EditorCommand {
  return {
    label: 'Move Keyframe',
    execute: (scene) => updateKfTimeMs(scene, timelineId, target, kfId, toMs),
    undo:    (scene) => updateKfTimeMs(scene, timelineId, target, kfId, fromMs),
  }
}

// ── Bulk move keyframes ───────────────────────────────────────────────────────
// Used when dragging a multi-selection — single undo step for all moves.

export interface KfMove {
  timelineId: string
  target: string
  kfId: string
  fromMs: number
  toMs: number
}

export function makeBulkMoveKfCmd(moves: KfMove[]): EditorCommand {
  return {
    label: `Move ${moves.length} Keyframes`,
    execute: (scene) =>
      moves.reduce(
        (s, m) => updateKfTimeMs(s, m.timelineId, m.target, m.kfId, m.toMs),
        scene,
      ),
    undo: (scene) =>
      moves.reduce(
        (s, m) => updateKfTimeMs(s, m.timelineId, m.target, m.kfId, m.fromMs),
        scene,
      ),
  }
}

// ── Bulk delete keyframes ─────────────────────────────────────────────────────
// Used when a multi-selection is deleted — single undo step restores all of them.

export interface KfDeletion {
  timelineId: string
  target: string
  kf: Keyframe
}

export function makeBulkDeleteKfCmd(items: KfDeletion[]): EditorCommand {
  return {
    label: `Delete ${items.length} Keyframes`,
    execute: (scene) =>
      items.reduce(
        (s, it) => removeKf(s, it.timelineId, it.target, it.kf.id),
        scene,
      ),
    undo: (scene) =>
      items.reduce(
        (s, it) => upsertKeyframe(s, it.timelineId, it.target, it.kf),
        scene,
      ),
  }
}

// ── Bulk insert (paste) keyframes ─────────────────────────────────────────────
// Each paste operation is a single undo step.

export interface KfInsertion {
  timelineId: string
  target: string
  kf: Keyframe
}

export function makePasteKfCmd(items: KfInsertion[]): EditorCommand {
  return {
    label: `Paste ${items.length} Keyframes`,
    execute: (scene) =>
      items.reduce(
        (s, it) => upsertKeyframe(s, it.timelineId, it.target, it.kf),
        scene,
      ),
    undo: (scene) =>
      items.reduce(
        (s, it) => removeKf(s, it.timelineId, it.target, it.kf.id),
        scene,
      ),
  }
}

// ── Snapshot all animatable properties on a layer at current time ─────────────
// Equivalent to AE's "Set all keyframes" — creates a keyframe at timeMs for
// every transform field + opacity, using the layer's current value. Missing
// tracks are created. Single undo step restores the entire timeline.

const DEFAULT_SNAPSHOT_PROPS = [
  'opacity',
  'transform.x', 'transform.y',
  'transform.scaleX', 'transform.scaleY',
  'transform.rotationDeg',
] as const

function readLayerNumber(layer: Layer, propertyPath: string): number | undefined {
  const parts = propertyPath.split('.')
  let cur: unknown = layer
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else { return undefined }
  }
  return typeof cur === 'number' ? cur : undefined
}

export function makeKeyframeLayerSnapshotCmd(
  timelineId: string,
  layer: Layer,
  timeMs: number,
  properties: readonly string[] = DEFAULT_SNAPSHOT_PROPS,
): EditorCommand {
  let snapshotForUndo: Track[] | null = null

  return {
    label: `Keyframe ${layer.name}`,
    execute(scene) {
      const tl = scene.timelines.find((t) => t.id === timelineId)
      if (!tl) return scene
      snapshotForUndo = tl.tracks

      let nextTracks: Track[] = [...tl.tracks]

      for (const prop of properties) {
        const value = readLayerNumber(layer, prop)
        if (value === undefined) continue

        const target = `layers.${layer.id}.${prop}`
        const newKf: Keyframe = {
          id: nextKfId(), timeMs, value, easing: { type: 'easeOut' },
        }
        const existing = nextTracks.find((t) => t.target === target)
        if (existing) {
          // Replace any keyframe within 1 ms of timeMs (avoid dup)
          const filtered = existing.keyframes.filter((k) => Math.abs(k.timeMs - timeMs) > 1)
          nextTracks = nextTracks.map((t) => t.target === target
            ? { ...t, keyframes: [...filtered, newKf].sort((a, b) => a.timeMs - b.timeMs) }
            : t)
        } else {
          nextTracks = [...nextTracks, { target, keyframes: [newKf] }]
        }
      }

      return {
        ...scene,
        timelines: scene.timelines.map((t) =>
          t.id === timelineId ? { ...t, tracks: nextTracks } : t),
      }
    },
    undo(scene) {
      if (snapshotForUndo == null) return scene
      return {
        ...scene,
        timelines: scene.timelines.map((t) =>
          t.id === timelineId ? { ...t, tracks: snapshotForUndo! } : t),
      }
    },
  }
}

// ── Update value (keyframe inspector edit) ────────────────────────────────────

export function makeUpdateKfValueCmd(
  timelineId: string,
  target: string,
  kfId: string,
  fromValue: AnimatableValue,
  toValue: AnimatableValue,
): EditorCommand {
  return {
    label: 'Edit Keyframe Value',
    execute: (scene) => updateKfValue(scene, timelineId, target, kfId, toValue),
    undo:    (scene) => updateKfValue(scene, timelineId, target, kfId, fromValue),
  }
}

// ── Update easing ─────────────────────────────────────────────────────────────

export function makeUpdateEasingCmd(
  timelineId: string,
  target: string,
  kfId: string,
  fromEasing: EasingDefinition,
  toEasing: EasingDefinition,
): EditorCommand {
  return {
    label: 'Change Easing',
    execute: (scene) => updateKfEasing(scene, timelineId, target, kfId, toEasing),
    undo:    (scene) => updateKfEasing(scene, timelineId, target, kfId, fromEasing),
  }
}
