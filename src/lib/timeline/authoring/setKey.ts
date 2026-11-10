import type { AnimatableValue, ChronoScene, Keyframe, Track } from '../../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { LayerIndex } from '../../scene/LayerIndex'
import { LayerTrackIndex } from '../LayerTrackIndex'
import { evaluateTrack } from '../../evaluator'
import { assertTrackValues } from '../../animation/typedValues'
import { nextKfId } from '../../defaults'
import { boundedKeyTime, compareKeyTime, sameKeyTime } from './keyTimePolicy'
import { keyableChannels, drivenChannelReason, type KeysetMode } from './keyableChannels'

export interface SetKeyOptions {
  timelineId: string; layerIds: readonly string[]; timeMs: number
  keyset?: KeysetMode; selectedTargets?: ReadonlySet<string>
  /** Committed authoring inputs, never final world/renderer overrides. */
  authoredValues?: ReadonlyMap<string, AnimatableValue>
}
export interface KeyDiagnostic { target: string; reason: string }
export interface SetKeyPlan { command: EditorCommand | null; diagnostics: KeyDiagnostic[]; targets: string[]; timeMs: number }

/** Prepare Set Key against one committed source. Samples ordinary track
 * interpolation in explicit timeline-local ms; untracked properties use typed
 * source. Protected/driven/unsupported channels are listed before commit.
 * Exact-time updates preserve ID/easing/tangents/segment modifiers. New keys
 * sample the current value; insertion is NOT claimed to split/preserve an
 * entire nonlinear segment. Keys/optional payloads are never guessed.
 * One command includes track creation and membership, with stable prepared IDs
 * across execute/undo/redo. Stale source refuses rather than overwriting edits.
 */
export function prepareSetKey(scene: ChronoScene, options: SetKeyOptions): SetKeyPlan {
  const timeline = scene.timelines.find(item => item.id === options.timelineId)
  if (!timeline) throw new Error('Choose an active timeline before setting keys.')
  const timeMs = boundedKeyTime(options.timeMs, timeline.durationMs)
  const index = new LayerIndex(scene.layers), trackIndex = new LayerTrackIndex(timeline.tracks)
  const diagnostics: KeyDiagnostic[] = [], replacements = new Map<string, Track>(), members = new Set<string>(), targets: string[] = []
  for (const id of Array.from(new Set(options.layerIds))) {
    const layer = index.get(id)
    if (!layer) { diagnostics.push({ target: id, reason: 'Layer no longer exists.' }); continue }
    const protectedLayer = Array.from(index.ancestorIds([id])).map(key => index.get(key)!).find(item => item.locked || item.frozen)
    if (protectedLayer) { diagnostics.push({ target: id, reason: `Unlock and unfreeze ${protectedLayer.name} first.` }); continue }
    if (layer.type === 'audio' && layer.audio?.timelineId && layer.audio.timelineId !== timeline.id) {
      diagnostics.push({ target: id, reason: 'Audio belongs to another timeline.' }); continue
    }
    const channels = keyableChannels(layer, trackIndex.forLayer(id), options.keyset ?? 'all', options.selectedTargets ?? new Set())
    if (!channels.length) diagnostics.push({ target: id, reason: 'No existing supported channels in this keyset.' })
    for (const channel of channels) {
      const target = `layers.${id}.${channel.path}`, track = channel.track
      const driven = drivenChannelReason(scene, layer, channel.path, track)
      if (driven) { diagnostics.push({ target, reason: driven }); continue }
      const existing = track?.keyframes.filter(key => sameKeyTime(key.timeMs, timeMs)) ?? []
      if (existing.length > 1) { diagnostics.push({ target, reason: 'Multiple keys share this time; resolve their identity before updating.' }); continue }
      const value = options.authoredValues?.get(target) ?? (track?.keyframes.length ? evaluateTrack(track, timeMs) : channel.value)
      if (value == null) { diagnostics.push({ target, reason: 'No supported source value at this time.' }); continue }
      const key: Keyframe = existing.length ? { ...existing[0], value } : { id: nextKfId(), timeMs, value, easing: { type: 'linear' } }
      const updated = { ...(track ?? { target }), keyframes: [...(track?.keyframes.filter(item => item.id !== key.id) ?? []), key].sort(compareKeyTime) }
      try { assertTrackValues(updated, channel.value) }
      catch (error) { diagnostics.push({ target, reason: (error as Error).message }); continue }
      replacements.set(target, updated); members.add(id); targets.push(target)
    }
  }
  const before = timeline, next = { ...timeline, tracks: timeline.tracks.map(track => replacements.get(track.target) ?? track),
    ...(timeline.layerIds ? { layerIds: Array.from(new Set([...timeline.layerIds, ...Array.from(members)])) } : {}) }
  for (const [target, track] of Array.from(replacements)) if (!timeline.tracks.some(item => item.target === target)) next.tracks.push(track)
  const command: EditorCommand | null = targets.length ? { label: `Set Key · ${members.size} layers · ${targets.length} channels`,
    execute(current) {
      if (current.layers !== scene.layers || current.timelines !== scene.timelines || current.bindings !== scene.bindings || current.parameterWires !== scene.parameterWires) throw new Error('Source changed. Read the current scene and set keys again.')
      return { ...current, timelines: current.timelines.map(item => item.id === timeline.id ? next : item) }
    }, undo: current => ({ ...current, timelines: current.timelines.map(item => item.id === timeline.id ? before : item) }) } : null
  return { command, diagnostics, targets, timeMs }
}
