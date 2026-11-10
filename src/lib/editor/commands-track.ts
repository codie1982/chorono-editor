/** Commands for track-level operations (out-of-range, curve modifiers). */

import type { ChronoScene, Track, Keyframe } from '../types/core'
import type { EditorCommand } from './commands-keyframe'
import type { OutOfRangeSettings } from '../animation/out-of-range/types'
import type { CurveModifier } from '../animation/modifiers/types'
import { isScalarNumericTrack } from '../animation/typedValues'

/** Update a track's out-of-range behavior settings.
 *  @param timelineId - Timeline containing the track
 *  @param target - Track target (e.g., "layers.card.opacity")
 *  @param prevSettings - Previous out-of-range settings (for undo)
 *  @param nextSettings - New out-of-range settings (for redo) */
export function makeSetOutOfRangeCmd(
  timelineId: string,
  target: string,
  prevSettings: OutOfRangeSettings | undefined,
  nextSettings: OutOfRangeSettings | undefined
): EditorCommand {
  return {
    label: 'Set Out of Range',
    execute: (scene) => updateOutOfRange(scene, timelineId, target, nextSettings),
    undo: (scene) => updateOutOfRange(scene, timelineId, target, prevSettings),
  }
}

/** Internal: Update out-of-range settings for a track. */
function updateOutOfRange(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  outOfRange: OutOfRangeSettings | undefined
): ChronoScene {
  const timeline = scene.timelines.find((t) => t.id === timelineId)
  if (!timeline) return scene

  const trackIdx = timeline.tracks.findIndex((t) => t.target === target)
  if (trackIdx === -1) return scene

  const track = timeline.tracks[trackIdx]
  const updatedTrack: Track = {
    ...track,
    outOfRange,
  }

  return {
    ...scene,
    timelines: scene.timelines.map((t) =>
      t.id === timelineId
        ? {
            ...t,
            tracks: [
              ...t.tracks.slice(0, trackIdx),
              updatedTrack,
              ...t.tracks.slice(trackIdx + 1),
            ],
          }
        : t
    ),
  }
}

// ── Curve Modifier Stack (BL-46) ────────────────────────────────────────────
//
// Modifiers live in TWO scopes:
//   • Track scope:   track.modifiers              (applied last)
//   • Segment scope: kf.segmentModifiers          (applied first, per segment)
//
// All four commands below take a discriminated `scope` field to address
// either array uniformly. Reorder + delete preserve identity (modifier.id)
// so React keys are stable across undo / redo.

export type ModifierScope =
  | { kind: 'track';   target: string }
  | { kind: 'segment'; target: string; keyframeId: string }

function updateScopeArray(
  scene: ChronoScene,
  timelineId: string,
  scope: ModifierScope,
  mutate: (arr: CurveModifier[]) => CurveModifier[],
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((tl) =>
      tl.id !== timelineId ? tl : {
        ...tl,
        tracks: tl.tracks.map((tr) => {
          if (tr.target !== scope.target) return tr
          if (scope.kind === 'track') {
            return { ...tr, modifiers: mutate(tr.modifiers ?? []) }
          }
          return {
            ...tr,
            keyframes: tr.keyframes.map((kf) =>
              kf.id !== scope.keyframeId ? kf
                : { ...kf, segmentModifiers: mutate(kf.segmentModifiers ?? []) }
            ),
          }
        }),
      }
    ),
  }
}

export function makeAddCurveModifierCmd(
  timelineId: string,
  scope: ModifierScope,
  modifier: CurveModifier,
): EditorCommand {
  return {
    label: `Add ${modifier.type} modifier`,
    execute: (scene) => updateScopeArray(scene, timelineId, scope, (arr) => [...arr, modifier]),
    undo:    (scene) => updateScopeArray(scene, timelineId, scope, (arr) => arr.filter((m) => m.id !== modifier.id)),
  }
}

export function makeRemoveCurveModifierCmd(
  timelineId: string,
  scope: ModifierScope,
  modifier: CurveModifier,
  /** Original index — restored on undo so order is preserved. */
  originalIndex: number,
): EditorCommand {
  return {
    label: `Remove ${modifier.type} modifier`,
    execute: (scene) => updateScopeArray(scene, timelineId, scope, (arr) => arr.filter((m) => m.id !== modifier.id)),
    undo:    (scene) => updateScopeArray(scene, timelineId, scope, (arr) => {
      const next = [...arr]
      const idx = Math.max(0, Math.min(next.length, originalIndex))
      next.splice(idx, 0, modifier)
      return next
    }),
  }
}

export function makeUpdateCurveModifierCmd(
  timelineId: string,
  scope: ModifierScope,
  modifierId: string,
  prev: CurveModifier,
  next: CurveModifier,
): EditorCommand {
  return {
    label: `Edit ${next.type} modifier`,
    execute: (scene) => updateScopeArray(scene, timelineId, scope, (arr) =>
      arr.map((m) => m.id === modifierId ? next : m)
    ),
    undo:    (scene) => updateScopeArray(scene, timelineId, scope, (arr) =>
      arr.map((m) => m.id === modifierId ? prev : m)
    ),
  }
}

export function makeReorderCurveModifierCmd(
  timelineId: string,
  scope: ModifierScope,
  fromIndex: number,
  toIndex: number,
): EditorCommand {
  function reorder(arr: CurveModifier[], from: number, to: number): CurveModifier[] {
    const next = [...arr]
    const [item] = next.splice(from, 1)
    if (!item) return arr
    next.splice(to, 0, item)
    return next
  }
  return {
    label: 'Reorder modifier',
    execute: (scene) => updateScopeArray(scene, timelineId, scope, (arr) => reorder(arr, fromIndex, toIndex)),
    undo:    (scene) => updateScopeArray(scene, timelineId, scope, (arr) => reorder(arr, toIndex, fromIndex)),
  }
}

/** Generate a fresh, stable modifier id. Crypto-free for hot path. */
export function nextModifierId(): string {
  return `mod_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

// ── Track curve fields (BL-48 polish) ──────────────────────────────────────
//
// Generic patcher for the small set of "curve / scalar" fields on Track:
// easeCurve, timeWarp, multiplierCurve, multiplierAmplitude. Undoable
// in one step regardless of how many fields the patch touches.

type TrackCurvePatch = Partial<Pick<Track,
  'easeCurve' | 'timeWarp' | 'multiplierCurve' | 'multiplierAmplitude'
>>

export function makeUpdateTrackCurvesCmd(
  timelineId: string,
  target:     string,
  prev:       TrackCurvePatch,
  next:       TrackCurvePatch,
): EditorCommand {
  function apply(scene: ChronoScene, patch: TrackCurvePatch): ChronoScene {
    return {
      ...scene,
      timelines: scene.timelines.map((tl) =>
        tl.id !== timelineId ? tl : {
          ...tl,
          tracks: tl.tracks.map((tr) => tr.target !== target ? tr : { ...tr, ...patch }),
        }
      ),
    }
  }
  // Label describes the dominant edit for the undo stack.
  const fields = Object.keys(next).join(', ')
  return {
    label: `Edit Track Curves (${fields || 'reset'})`,
    execute: (scene) => apply(scene, next),
    undo:    (scene) => apply(scene, prev),
  }
}

// ── Bake Track to Keyframes (BL-51 polish) ─────────────────────────────────
//
// Editor-side bake: replace the track in place with its baked equivalent
// (keyframes only, all signal-system fields stripped). Snapshots the
// original for undo. Use to "freeze" a noise/modifier-heavy track when
// you want a deterministic kf list you can edit by hand.

import { bakeTrack, validateBakeOptions } from '../animation/baking/bake'
import type { BakeOptions } from '../animation/baking/bake'

/** Prepare a bounded numeric bake and return one undoable source replacement.
 * The selected window becomes linear keys; outside authored keys and unrelated
 * metadata survive. Signal processors are removed from the whole track. */
export function makeBakeTrackToKeyframesCmd(
  timelineId: string,
  target:     string,
  prevTrack:  Track,
  options:    BakeOptions,
): EditorCommand {
  const baked = bakeTrack(prevTrack, { ...options, keyIdPrefix: timelineId })
  return makeApplyTrackBakeCmd(timelineId, target, prevTrack, baked, options)
}

/** Apply one already-reviewed numeric conversion. Stale track data or invalid
 * timeline bounds reject before publishing; unrelated source edits survive.
 * Prepared IDs/payload remain stable across execute/undo/redo. Source equality
 * is structural because script handles expose detached tracks. */
export function makeApplyTrackBakeCmd(timelineId: string, target: string, prevTrack: Track, baked: Track, options: BakeOptions): EditorCommand {
  let before: import('../types').Timeline | undefined
  return {
    label: `Bake Track to Keyframes (${baked.keyframes.length} kfs)`,
    execute: (scene) => {
      validateBakeOptions(options)
      const timeline = scene.timelines.find(item => item.id === timelineId)
      const live = timeline?.tracks.find(track => track.target === target)
      if (!timeline || !live || JSON.stringify(live) !== JSON.stringify(prevTrack)) throw new Error('Track changed. Preview the current source before baking.')
      if (baked.target !== target || !isScalarNumericTrack(baked)) throw new Error('The prepared bake must belong to this numeric source track.')
      if (options.endMs > timeline.durationMs || options.startMs < 0 || options.signal?.aborted) throw new Error('Bake range is outside this timeline, or the operation was cancelled.')
      before = timeline
      const layerId = /^layers\.([^.]+)\./.exec(target)?.[1]
      return {
      ...scene,
      timelines: scene.timelines.map((tl) =>
        tl.id !== timelineId ? tl : {
          ...tl,
          ...(layerId && tl.layerIds ? { layerIds: Array.from(new Set([...tl.layerIds, layerId])) } : {}),
          tracks: tl.tracks.map((tr) => tr.target !== target ? tr : baked),
        }
      ),
      }
    },
    undo: (scene) => ({
      ...scene,
      timelines: scene.timelines.map((tl) =>
        tl.id === timelineId && before ? before : tl
      ),
    }),
  }
}

// ── Procedural Controller (BL-50) ───────────────────────────────────────────

import type { TrackController } from '../animation/controllers/types'

export function makeSetTrackControllerCmd(
  timelineId: string,
  target:     string,
  prev:       TrackController | undefined,
  next:       TrackController | undefined,
): EditorCommand {
  function apply(scene: ChronoScene, controller: TrackController | undefined): ChronoScene {
    return {
      ...scene,
      timelines: scene.timelines.map((tl) =>
        tl.id !== timelineId ? tl : {
          ...tl,
          tracks: tl.tracks.map((tr) => tr.target !== target ? tr : { ...tr, controller }),
        }
      ),
    }
  }
  const label = next?.type === 'keyframe' || next === undefined
    ? 'Reset Controller (Keyframe)'
    : `Set Controller: ${next.type}`
  return {
    label,
    execute: (scene) => apply(scene, next),
    undo:    (scene) => apply(scene, prev),
  }
}

// Keyframe is intentionally imported above to keep this file as the single
// source for "everything that touches a Track from the editor". Re-export
// for callers that already pull from commands-track.
export type { Keyframe }
