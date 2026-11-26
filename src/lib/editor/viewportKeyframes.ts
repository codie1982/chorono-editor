import type { ChronoScene, Layer, Timeline, Track } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { authoringTime } from '../timeline/authoring/timelineNavigation'
import { makeAddTimelineCmd } from './commands-timeline'
import { newAuthoringTimeline, nextKfId } from '../defaults'
import { ensureLayerInTimeline, insertKf, updateKfValue } from '../timeline/keyframeOps'

/** One source-layer edit, with optional channel intent from an evaluated
 * gesture. Intent matters when a displayed animated value is moved back to
 * the authored base value: raw before/after equality alone misses that edit. */
export interface ViewportLayerChange {
  prev: Layer
  next: Layer
  changedProperties?: readonly string[]
}

export interface ViewportKeyframeOptions {
  timelineId: string
  /** Milliseconds on the supplied clock. Existing callers supply project playback time. */
  timeMs: number
  timeBasis?: 'globalPlayback' | 'local'
  /** Auto/active Record keys new channels; Manual edits existing keyed ones. */
  autoKeyframe: boolean
}

const CHANNELS = ['x', 'y', 'scaleX', 'scaleY', 'rotationDeg'] as const
/** A numeric track edit. An optional initial sample holds its pre-edit value
 * until the first keyed switch on a previously unanimated channel. */
export interface ScalarKeyEdit { layerId: string; target: string; value: number; initialValue?: number }

/** Extract transform intent only. Geometry-only edits do not require a clock
 * or a timeline, even when their layer happens to have transform animation. */
function intendedKeys(changes: readonly ViewportLayerChange[]): ScalarKeyEdit[] {
  return changes.flatMap(change => CHANNELS.filter(channel => change.changedProperties
    ? change.changedProperties.includes(`transform.${channel}`)
    : change.prev.transform[channel] !== change.next.transform[channel]).map(channel => ({
      layerId: change.next.id, target: `layers.${change.next.id}.transform.${channel}`,
      value: change.next.transform[channel],
    })))
}

/** Reject driven tracks whose output cannot safely be written back as input. */
function assertEditableTrack(track: Track): void {
  if ((track.controller && track.controller.type !== 'keyframe') || track.timeWarp
      || track.easeCurve || track.multiplierCurve || track.modifiers?.some(mod => mod.enabled)
      || track.keyframes.some(key => key.segmentModifiers?.some(mod => mod.enabled))) {
    throw new Error('Bake driven transform channels before editing their pose.')
  }
}

/** Apply only intended scalar transform keys on one timeline. Existing keys
 * retain identity, easing, tangents and unknown metadata. A new key is linear;
 * other key records and tracks are retained. Ambiguous near-time collisions
 * fail before the command is returned, without deleting neighbouring keys. */
function applyKeys(scene: ChronoScene, edits: readonly ScalarKeyEdit[],
  timeline: Timeline, timeMs: number): ChronoScene {
  let next = scene
  for (const { target, value, layerId, initialValue } of edits) {
      if (!Number.isFinite(value)) throw new Error('Transform values must be finite.')
      const track = timeline.tracks.find(item => item.target === target)
      const nearby = track?.keyframes.filter(key => Math.abs(key.timeMs - timeMs) <= 1) ?? []
      if (nearby.length > 1 || (nearby.length === 1 && Math.abs(nearby[0].timeMs - timeMs) > 1e-6)) {
        throw new Error('A nearby keyframe would collide with this edit. Move the playhead to that key first.')
      }
      if (!track) {
        next = { ...next, timelines: next.timelines.map(tl => tl.id !== timeline.id ? tl : {
          ...tl, tracks: [...tl.tracks, { target, keyframes: [] }],
        }) }
      }
      if (!track?.keyframes.length && initialValue !== undefined && timeMs > 1e-6) {
        next = insertKf(next, timeline.id, target, { id: nextKfId(), timeMs: 0, value: initialValue, easing: { type: 'hold' } })
      }
      next = nearby.length
        ? updateKfValue(next, timeline.id, target, nearby[0].id, value)
        : insertKf(next, timeline.id, target, {
          id: nextKfId(), timeMs, value, easing: { type: 'linear' },
        })
      next = ensureLayerInTimeline(next, timeline.id, layerId)
  }
  return next
}

/** Build the key part of a viewport transaction, to batch with its layer
 * commands. Preparation is immutable and all-or-nothing; errors leave history
 * untouched. Execute/undo replace only the chosen timeline and retain all
 * other scene fields, so the surrounding layer command remains authoritative.
 * Local authoring includes the final frame even on a looping timeline. Auto
 * Key in a scene with no timeline stages its first timeline with the keys.
 * Existing callers without intent use raw transform differences. */
export function buildViewportKeyframeCommands(scene: ChronoScene,
  changes: readonly ViewportLayerChange[], options: ViewportKeyframeOptions): EditorCommand[] {
  return buildScalarKeyframeCommands(scene, intendedKeys(changes), options)
}

/** Stage numeric property keys on one authoring clock, sharing collision,
 * driven-track, timeline membership and exact Undo rules with viewport edits. */
export function buildScalarKeyframeCommands(scene: ChronoScene, intended: readonly ScalarKeyEdit[], options: ViewportKeyframeOptions): EditorCommand[] {
  if (!intended.length) return []
  const existing = scene.timelines.find(tl => tl.id === options.timelineId)
  const targets = new Set(intended.map(edit => edit.target))
  for (const timeline of scene.timelines) {
    for (const track of timeline.tracks) {
      if (!targets.has(track.target)) continue
      if (timeline.id !== options.timelineId) {
        throw new Error('This transform is animated on another timeline. Edit its timeline before changing the pose.')
      }
      assertEditableTrack(track)
    }
  }
  const before = existing ?? (!scene.timelines.length && !options.timelineId && options.autoKeyframe
    ? newAuthoringTimeline(scene.composition.durationMs) : undefined)
  if (!before) return []
  const edits = intended.filter(edit => options.autoKeyframe
    || before.tracks.some(track => track.target === edit.target && track.keyframes.length > 0))
  if (!edits.length) return []
  if (!Number.isFinite(options.timeMs) || options.timeMs < 0
      || !Number.isFinite(before.durationMs) || before.durationMs <= 0) {
    throw new Error('The active timeline must have a valid playhead and duration.')
  }
  const time = authoringTime(before, options.timeMs, options.timeBasis ?? 'globalPlayback')
  const staged = existing ? scene : { ...scene, timelines: [before] }
  const after = applyKeys(staged, edits, before, time)
    .timelines.find(tl => tl.id === before.id)!
  if (!existing) return [makeAddTimelineCmd(after)]
  if (after === before) return []
  const replace = (source: ChronoScene, timeline: Timeline): ChronoScene => ({
    ...source, timelines: source.timelines.map(tl => tl.id === timeline.id ? timeline : tl),
  })
  return [{ label: 'Key viewport transform', execute: source => replace(source, after),
    undo: source => replace(source, before) }]
}
