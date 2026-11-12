// ── Keyframe Commands ─────────────────────────────────────────────────────────
// Factory functions that return EditorCommand objects.
// Each command carries both execute() and undo() so history can reverse it.

import type { ChronoScene, Keyframe, Layer, Track, EasingDefinition, AnimatableValue } from '../types'
import {
  updateKfValue, updateKfEasing, upsertKeyframe,
} from '../timeline/keyframeOps'
import { prepareSetKey } from '../timeline/authoring/setKey'
import { makeKeyframeBatchCmd, type KeyframeBatchOptions } from '../timeline/authoring/keyframeBatch'
import { readPropertyPath } from '../scene/properties/readPropertyPath'

export interface EditorCommand {
  /** Human-readable label shown in undo history (e.g. "Move Keyframe") */
  label: string
  /** Internal commit context; ignored by pure execute/preview and restored by history. */
  authoring?: import('../types/authoring').AuthoringHints
  execute(scene: ChronoScene): ChronoScene
  undo(scene: ChronoScene): ChronoScene
}

// ── Add keyframe ──────────────────────────────────────────────────────────────

export function makeAddKfCmd(
  timelineId: string,
  target: string,
  kf: Keyframe,
): EditorCommand {
  let before: ChronoScene | null = null
  return { label: 'Add Keyframe', execute: scene => { before = scene; return upsertKeyframe(scene, timelineId, target, kf) },
    undo: scene => before ? { ...scene, timelines: scene.timelines.map(timeline => timeline.id === timelineId
      ? before!.timelines.find(item => item.id === timelineId) ?? timeline : timeline) } : scene }
}

// ── Delete keyframe ───────────────────────────────────────────────────────────

export function makeDeleteKfCmd(
  timelineId: string,
  target: string,
  kf: Keyframe,
): EditorCommand {
  return { ...makeBulkDeleteKfCmd([{ timelineId, target, kf }]), label: 'Delete Keyframe' }
}

// ── Move keyframe ─────────────────────────────────────────────────────────────

export function makeMoveKfCmd(
  timelineId: string,
  target: string,
  kfId: string,
  fromMs: number,
  toMs: number,
): EditorCommand {
  return makeKeyframeBatchCmd('Move Keyframe', { moves: [{ timelineId, target, kfId, fromMs, toMs }] })
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

/** Atomic simultaneous move; common bounds/collision policy, exact key metadata. */
export function makeBulkMoveKfCmd(moves: KfMove[], options: KeyframeBatchOptions = {}): EditorCommand {
  return makeKeyframeBatchCmd(`Move ${moves.length} Keyframes`, { moves }, options)
}

// ── Bulk delete keyframes ─────────────────────────────────────────────────────
// Used when a multi-selection is deleted — single undo step restores all of them.

export interface KfDeletion {
  timelineId: string
  target: string
  kf: Keyframe
}

/** Delete by stable identity, never by inferred time. Grouped timeline/target
 * lookups filter each affected track once: O(items + scene tracks + affected
 * keys), rather than cloning the scene for every deletion. Unaffected tracks
 * retain references; empty tracks keep controllers/modifiers/settings.
 * Snapshot restoration preserves legacy coincident keys and all metadata. */
export function makeBulkDeleteKfCmd(items: KfDeletion[]): EditorCommand {
  let before = new Map<string, Track[]>()
  const groups = new Map<string, Map<string, Set<string>>>()
  for (const item of items) {
    let targets = groups.get(item.timelineId)
    if (!targets) { targets = new Map(); groups.set(item.timelineId, targets) }
    let keys = targets.get(item.target)
    if (!keys) { keys = new Set(); targets.set(item.target, keys) }
    keys.add(item.kf.id)
  }
  return {
    label: `Delete ${items.length} Keyframes`,
    execute: (scene) => {
      before = new Map(scene.timelines.filter(timeline => groups.has(timeline.id)).map(timeline => [timeline.id, timeline.tracks]))
      return { ...scene, timelines: scene.timelines.map(timeline => {
        const targets = groups.get(timeline.id)
        return targets ? { ...timeline, tracks: timeline.tracks.map(track => {
          const keys = targets.get(track.target)
          return keys ? { ...track, keyframes: track.keyframes.filter(key => !keys.has(key.id)) } : track
        }) } : timeline
      }) }
    },
    undo: scene => ({ ...scene, timelines: scene.timelines.map(timeline => before.has(timeline.id)
      ? { ...timeline, tracks: before.get(timeline.id)! } : timeline) }),
  }
}

// ── Bulk insert (paste) keyframes ─────────────────────────────────────────────
// Each paste operation is a single undo step.

export interface KfInsertion {
  /** Optional native clipboard lineage; never serialized into the key itself. */
  copiedFrom?: import('../types/authoring').AuthoringAddress
  timelineId: string
  target: string
  kf: Keyframe
}

/** Paste is atomic; explicit overwrite is opt-in and lineage stays attached. */
export function makePasteKfCmd(items: KfInsertion[], options: KeyframeBatchOptions = {}): EditorCommand {
  return { ...makeKeyframeBatchCmd(`Paste ${items.length} Keyframes`, { insertions: items }, options),
    authoring: { copies: items.flatMap(item => item.copiedFrom ? [{ from: item.copiedFrom, to: ['key', item.timelineId, item.target, item.kf.id] as const }] : []) } }
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

/** Compatibility snapshot of explicitly supplied authored inputs, used while
 * committing inspector/canvas edits. Set Key without a supplied edit samples
 * interpolation through prepareSetKey instead. Missing payloads stay absent. */
export function makeKeyframeLayerSnapshotCmd(timelineId: string, layer: Layer, timeMs: number,
  properties: readonly string[] = DEFAULT_SNAPSHOT_PROPS): EditorCommand {
  let plan: ReturnType<typeof prepareSetKey> | null = null, baseline: ChronoScene | null = null
  return { label: `Keyframe ${layer.name}`, execute(scene) {
    if (baseline !== scene) {
      const selectedTargets = new Set(properties.map(path => `layers.${layer.id}.${path}`))
      const authoredValues = new Map<string, AnimatableValue>()
      for (const path of properties) { const value = readPropertyPath(layer, path); if (value !== undefined) authoredValues.set(`layers.${layer.id}.${path}`, value as AnimatableValue) }
      plan = prepareSetKey(scene, { timelineId, layerIds: [layer.id], timeMs, keyset: 'selected', selectedTargets, authoredValues }); baseline = scene
    }
    return plan?.command?.execute(scene) ?? scene
  }, undo: scene => plan?.command?.undo(scene) ?? scene }
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

// ── Mirror Timing ────────────────────────────────────────────────────────────
//
// Reverses the keyframe time pattern within a SHARED bounding window
// [minMs, maxMs]. Each kf at relative position p from the left becomes the
// kf at relative position (1 - p) — visually the sequence plays backward in
// time without altering the values. Operates on a flat list of kfId+target
// pairs so it works across multiple tracks (e.g. mirror a whole animation's
// timing in one command).
//
// Implementation note: we capture each kf's PRIOR timeMs at command-build
// time so undo restores exactly the original timings (not a recomputed
// mirror, which would no-op in some edge cases).

export interface KfMirror { kfId: string; target: string; timelineId: string }
export function makeMirrorTimingCmd(
  scene: ChronoScene,
  items: KfMirror[],
  options: KeyframeBatchOptions = {},
): EditorCommand | null {
  if (items.length < 2) return null
  // Collect (timelineId × target × kfId) → priorMs
  type Snap = { timelineId: string; target: string; kfId: string; priorMs: number }
  const snaps: Snap[] = []
  for (const it of items) {
    const tl = scene.timelines.find((t) => t.id === it.timelineId)
    const tr = tl?.tracks.find((t) => t.target === it.target)
    const kf = tr?.keyframes.find((k) => k.id === it.kfId)
    if (!kf) continue
    snaps.push({ timelineId: it.timelineId, target: it.target, kfId: it.kfId, priorMs: kf.timeMs })
  }
  if (snaps.length < 2) return null
  const minMs = Math.min(...snaps.map((s) => s.priorMs))
  const maxMs = Math.max(...snaps.map((s) => s.priorMs))
  const mirroredFor = (ms: number) => minMs + (maxMs - ms)

  return makeKeyframeBatchCmd('Mirror Timing', { moves: snaps.map(item => ({ timelineId: item.timelineId,
    target: item.target, kfId: item.kfId, fromMs: item.priorMs, toMs: mirroredFor(item.priorMs) })) }, options)
}

// ── Align selected kfs to nearest frame boundary ────────────────────────────

export interface KfAlign { kfId: string; target: string; timelineId: string }
export function makeAlignToFrameCmd(
  scene: ChronoScene,
  items: KfAlign[],
  frameRate: number,
  options: KeyframeBatchOptions = {},
): EditorCommand | null {
  if (items.length === 0 || frameRate <= 0) return null
  const frameMs = 1000 / frameRate
  type Snap = { timelineId: string; target: string; kfId: string; priorMs: number; snappedMs: number }
  const snaps: Snap[] = []
  for (const it of items) {
    const tl = scene.timelines.find((t) => t.id === it.timelineId)
    const tr = tl?.tracks.find((t) => t.target === it.target)
    const kf = tr?.keyframes.find((k) => k.id === it.kfId)
    if (!kf) continue
    const snapped = Math.round(kf.timeMs / frameMs) * frameMs
    if (snapped === kf.timeMs) continue
    snaps.push({ timelineId: it.timelineId, target: it.target, kfId: it.kfId, priorMs: kf.timeMs, snappedMs: snapped })
  }
  if (snaps.length === 0) return null

  return makeKeyframeBatchCmd('Align Keyframes to Frame', { moves: snaps.map(item => ({ timelineId: item.timelineId,
    target: item.target, kfId: item.kfId, fromMs: item.priorMs, toMs: item.snappedMs })) }, options)
}

// ── Flatten segment ──────────────────────────────────────────────────────────
//
// Sets kfB.value to kfA.value so the curve renders as a horizontal line
// between the two keys (their easing is preserved — the segment is "flat"
// in value space). Useful for holding a value across a span without
// converting both endpoints to hold easing.

export function makeFlattenSegmentCmd(
  scene:       ChronoScene,
  timelineId:  string,
  target:      string,
  kfAId:       string,
  kfBId:       string,
): EditorCommand | null {
  const tl = scene.timelines.find((t) => t.id === timelineId)
  const tr = tl?.tracks.find((t) => t.target === target)
  const kfA = tr?.keyframes.find((k) => k.id === kfAId)
  const kfB = tr?.keyframes.find((k) => k.id === kfBId)
  if (!kfA || !kfB) return null
  if (typeof kfA.value !== 'number' || typeof kfB.value !== 'number') return null
  const fromValue = kfB.value
  const toValue   = kfA.value
  return {
    label: 'Flatten Segment',
    execute: (s) => updateKfValue(s, timelineId, target, kfBId, toValue),
    undo:    (s) => updateKfValue(s, timelineId, target, kfBId, fromValue),
  }
}

// ── Reverse values ───────────────────────────────────────────────────────────
//
// Mirrors selected keyframes' VALUES around their min/max midpoint. Times
// untouched (use makeMirrorTimingCmd for the time axis). Useful for flipping
// a fade-in into a fade-out without re-keying.

export interface KfValueRef { kfId: string; target: string; timelineId: string }

export function makeReverseValuesCmd(
  scene: ChronoScene,
  items: KfValueRef[],
): EditorCommand | null {
  if (items.length < 2) return null
  type Snap = { timelineId: string; target: string; kfId: string; priorVal: number }
  const snaps: Snap[] = []
  for (const it of items) {
    const tl = scene.timelines.find((t) => t.id === it.timelineId)
    const tr = tl?.tracks.find((t) => t.target === it.target)
    const kf = tr?.keyframes.find((k) => k.id === it.kfId)
    if (!kf || typeof kf.value !== 'number') continue
    snaps.push({ timelineId: it.timelineId, target: it.target, kfId: it.kfId, priorVal: kf.value })
  }
  if (snaps.length < 2) return null
  const minV = Math.min(...snaps.map((s) => s.priorVal))
  const maxV = Math.max(...snaps.map((s) => s.priorVal))
  const mirroredFor = (v: number) => minV + (maxV - v)
  return {
    label: 'Reverse Values',
    execute(s) {
      let next = s
      for (const sn of snaps) next = updateKfValue(next, sn.timelineId, sn.target, sn.kfId, mirroredFor(sn.priorVal))
      return next
    },
    undo(s) {
      let next = s
      for (const sn of snaps) next = updateKfValue(next, sn.timelineId, sn.target, sn.kfId, sn.priorVal)
      return next
    },
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
  let original: Keyframe | undefined
  return {
    label: 'Change Easing',
    execute: (scene) => {
      original ??= scene.timelines.find(timeline => timeline.id === timelineId)?.tracks
        .find(track => track.target === target)?.keyframes.find(key => key.id === kfId)
      return updateKfEasing(scene, timelineId, target, kfId, toEasing)
    },
    undo: (scene) => original ? { ...scene, timelines: scene.timelines.map(timeline => timeline.id !== timelineId ? timeline : {
      ...timeline, tracks: timeline.tracks.map(track => track.target !== target ? track : {
        ...track, keyframes: track.keyframes.map(key => key.id === kfId ? original! : key),
      }),
    }) } : updateKfEasing(scene, timelineId, target, kfId, fromEasing),
  }
}

// ── Scale keyframes (BL-07) ────────────────────────────────────────────────────
// Scales time spacing of selected keyframes around a pivot point.

export interface ScaleKfItem {
  timelineId: string
  target: string
  kfId: string
  fromMs: number
}

/** Scale selected times together; no per-key clamp or implicit overwrite. */
export function makeScaleKeysCmd(items: ScaleKfItem[], pivotMs: number, scaleFactor: number,
  options: KeyframeBatchOptions = {}): EditorCommand {
  const moves = items.map(item => ({ ...item, toMs: pivotMs + (item.fromMs - pivotMs) * scaleFactor }))
  return makeKeyframeBatchCmd(`Scale ${items.length} Keyframes`, { moves }, options)
}

// ── Stagger keyframes (BL-07) ──────────────────────────────────────────────────
// Applies cumulative time offset to create cascading timing.

export interface StaggerKfItem {
  timelineId: string
  target: string
  kfId: string
  fromMs: number
  index: number
}

/** Stable selection indices define stagger order; all times validate together. */
export function makeStaggerKeysCmd(items: StaggerKfItem[], offsetMs: number, direction: 'forward' | 'backward',
  options: KeyframeBatchOptions = {}): EditorCommand {
  const moves = items.map(item => ({ ...item, toMs: item.fromMs + offsetMs * item.index * (direction === 'forward' ? 1 : -1) }))
  return makeKeyframeBatchCmd(`Stagger ${items.length} Keyframes`, { moves }, options)
}
