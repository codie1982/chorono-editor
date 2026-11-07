import type { Asset, AudioData, ChronoScene, Layer, Timeline } from '../types'
import { newAudioLayer, nextKfId } from '../defaults'
import { normalizeAudioClipPatch, resolveAudioClipWindow } from '../audio/audioClip'
import type { EditorCommand } from './commands-keyframe'

export interface AudioClipCommandOptions { timelineId?: string }
export interface AddAudioClipOptions extends AudioClipCommandOptions {
  startMs?: number
  layerId?: string
  name?: string
  /** Importers may preserve an already allocated clip identity and settings. */
  layer?: Layer
  /** Duplicate an existing clip without expanding it to the entire source. */
  preserveDuration?: boolean
}
let clipIdCounter = 0
const newClipId = () => `audio_${Date.now()}_${++clipIdCounter}_clip`
function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`)
  return value
}
function nonEmptyId(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must not be empty.`)
  return value
}
function transaction(label: string, update: (scene: ChronoScene) => ChronoScene): EditorCommand {
  let before: ChronoScene | undefined
  return { label, execute(scene) { const after = update(scene); before = scene; return after }, undo: scene => before ?? scene }
}
function clip(scene: ChronoScene, id: string): Layer & { audio: AudioData } {
  const layer = scene.layers.find(item => item.id === id)
  if (!layer || layer.type !== 'audio' || !layer.audio) throw new Error('Audio clip was not found.')
  if (layer.locked) throw new Error('Unlock the audio clip before editing it.')
  return layer as Layer & { audio: AudioData }
}
function assetFor(scene: ChronoScene, assetId: string): Asset {
  const asset = scene.assets.find(item => item.id === assetId)
  if (!asset || asset.type !== 'audio') throw new Error('Audio source was not found.')
  if (asset.durationMs !== undefined && (!Number.isFinite(asset.durationMs) || asset.durationMs <= 0)) throw new Error('Audio source duration must be positive and finite.')
  return asset
}
function timelineIdFor(scene: ChronoScene, layer: Layer, options: AudioClipCommandOptions): string | undefined {
  const id = options.timelineId ?? layer.audio?.timelineId
  if (id !== undefined) nonEmptyId(id, 'Audio timeline id')
  if (id && !scene.timelines.some(timeline => timeline.id === id)) throw new Error('Audio timeline was not found.')
  return id
}
function extendDuration(scene: ChronoScene, endMs: number, timelineId?: string): ChronoScene {
  return { ...scene, composition: { ...scene.composition, durationMs: Math.max(scene.composition.durationMs, endMs) },
    timelines: scene.timelines.map(timeline => timeline.id === timelineId && endMs > timeline.durationMs ? { ...timeline, durationMs: endMs } : timeline) }
}
function replaceClip(scene: ChronoScene, next: Layer, options: AudioClipCommandOptions): ChronoScene {
  return extendDuration({ ...scene, layers: scene.layers.map(layer => layer.id === next.id ? next : layer) }, next.endMs ?? 0, timelineIdFor(scene, next, options))
}
function clampFades(layer: Layer): Layer {
  const range = resolveAudioClipWindow(layer)
  return { ...layer, audio: { ...layer.audio!, fadeInMs: range.fadeInMs, fadeOutMs: range.fadeOutMs } }
}
function advanceSourceOffset(layer: Layer, offsetMs: number, sourceDurationMs?: number): number {
  return layer.audio?.loop && sourceDurationMs ? ((offsetMs % sourceDurationMs) + sourceDurationMs) % sourceDurationMs : Math.max(0, offsetMs)
}

/** Shared by file import, asset-library insertion and MCP. */
export function makeAddAudioClipCmd(asset: Asset, options: AddAudioClipOptions = {}): EditorCommand {
  const initial = options.layer ?? newAudioLayer(asset.id, asset.durationMs)
  const id = options.layerId ?? initial.id
  return transaction('Add Audio Clip', scene => {
    if (asset.type !== 'audio') throw new Error('An audio clip requires an audio asset.')
    if (initial.type !== 'audio') throw new Error('An audio clip requires an audio layer.')
    nonEmptyId(id, 'Audio clip id')
    if (scene.layers.some(layer => layer.id === id)) throw new Error('Audio clip id already exists.')
    const timelineId = options.timelineId ?? initial.audio?.timelineId
    if (timelineId !== undefined) nonEmptyId(timelineId, 'Audio timeline id')
    if (timelineId && !scene.timelines.some(timeline => timeline.id === timelineId)) throw new Error('Audio timeline was not found.')
    const source = scene.assets.find(item => item.id === asset.id) ?? asset
    if (source.type !== 'audio' || (source.durationMs !== undefined && (!Number.isFinite(source.durationMs) || source.durationMs <= 0))) throw new Error('Audio source duration must be positive and finite.')
    const startMs = Math.max(0, finite(options.startMs ?? initial.startMs ?? 0, 'Clip start'))
    const normalized = normalizeAudioClipPatch(initial.audio ?? { assetId: source.id }, Infinity, source.durationMs)
    const sourceOffsetMs = normalized.startOffsetMs ?? 0
    const sourceRemaining = source.durationMs === undefined ? Infinity : Math.max(0, source.durationMs - sourceOffsetMs)
    const duration = options.preserveDuration && initial.endMs !== undefined
      ? Math.min(Math.max(0, finite(initial.endMs, 'Clip end') - (initial.startMs ?? 0)), initial.audio?.loop ? Infinity : sourceRemaining)
      : source.durationMs === undefined ? Math.max(1000, scene.composition.durationMs - startMs) : sourceRemaining
    if (duration <= 0) throw new Error('The audio clip has no playable source samples.')
    const next = clampFades({ ...initial, id, name: options.name ?? source.name, startMs, endMs: startMs + duration,
      audio: { ...initial.audio, ...normalized, assetId: source.id, startOffsetMs: sourceOffsetMs, timelineId } })
    const added = { ...scene, assets: scene.assets.some(item => item.id === source.id) ? scene.assets : [...scene.assets, source],
      layers: [...scene.layers, next], timelines: scene.timelines.map(timeline => timeline.id === timelineId && timeline.layerIds !== undefined
        ? { ...timeline, layerIds: [...timeline.layerIds, id] } : timeline) }
    return extendDuration(added, next.endMs!, timelineId)
  })
}

export function makePatchAudioClipCmd(layerId: string, patch: Partial<AudioData>, options: AudioClipCommandOptions = {}): EditorCommand {
  return transaction('Edit Audio Clip', scene => {
    const layer = clip(scene, layerId)
    const source = assetFor(scene, patch.assetId ?? layer.audio.assetId)
    timelineIdFor(scene, layer, options)
    const window = resolveAudioClipWindow(layer, source.durationMs, scene.composition.durationMs)
    const resetFade = 'fadeInMs' in patch || 'fadeOutMs' in patch
    const fadeDuration = resetFade ? window.durationMs : window.fadeEndMs - window.fadeStartMs
    const normalized = normalizeAudioClipPatch(patch, fadeDuration, source.durationMs)
    let next: Layer = { ...layer, audio: { ...layer.audio, ...normalized, ...(resetFade ? { fadeRange: undefined } : {}) } }
    const resolved = resolveAudioClipWindow(next, source.durationMs, window.endMs)
    if (resolved.durationMs <= 0) throw new Error('The audio clip has no playable source samples.')
    next = clampFades({ ...next, startMs: resolved.startMs, endMs: resolved.endMs, audio: { ...next.audio!, startOffsetMs: resolved.sourceOffsetMs } })
    const owner = next.audio?.timelineId
    if (owner && !scene.timelines.some(timeline => timeline.id === owner)) throw new Error('Audio timeline was not found.')
    const ownerChanged = 'timelineId' in patch && owner !== layer.audio.timelineId
    // Ownership changes must extend the destination, even when the inspector's
    // gesture context still names the previously selected/owning timeline.
    let result = replaceClip(scene, next, ownerChanged ? { timelineId: owner } : options)
    // Global clips keep their existing view memberships. Ownership controls
    // playback scope independently of which timelines display a clip row.
    if (ownerChanged && owner !== undefined) result = { ...result, timelines: result.timelines.map(timeline => ({ ...timeline,
      layerIds: timeline.layerIds === undefined ? undefined : timeline.id === owner
        ? Array.from(new Set([...timeline.layerIds, layerId])) : timeline.id === layer.audio.timelineId ? timeline.layerIds.filter(id => id !== layerId) : timeline.layerIds })) }
    return result
  })
}

/** Edit the gain envelope without replacing an existing key's curve metadata. */
export function makeSetAudioGainKeyCmd(layerId: string, timeMs: number, gain: number, options: AudioClipCommandOptions = {}): EditorCommand {
  const newKeyId = nextKfId()
  return transaction('Set Audio Gain Keyframe', scene => {
    const layer = clip(scene, layerId)
    finite(timeMs, 'Gain key time')
    if (Math.abs(timeMs) > 3600000) throw new Error('Gain key time must be within one hour of the timeline origin.')
    const value = normalizeAudioClipPatch({ volume: gain }, 0).volume!
    const timelineId = timelineIdFor(scene, layer, options)
    if (!timelineId) throw new Error('Select a timeline before adding a gain keyframe.')
    const target = `layers.${layerId}.audio.volume`
    return { ...scene, timelines: scene.timelines.map(timeline => {
      if (timeline.id !== timelineId) return timeline
      const track = timeline.tracks.find(item => item.target === target)
      if (!track) return { ...timeline, tracks: [...timeline.tracks, { target, keyframes: [
        { id: newKeyId, timeMs, value, easing: { type: 'linear' } },
      ] }] }
      const existing = track.keyframes.filter(key => Math.abs(key.timeMs - timeMs) <= 1)
        .sort((a, b) => Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs))[0]
      const keyframes = existing ? track.keyframes.map(key => key.id === existing.id ? { ...key, value } : key)
        : [...track.keyframes, { id: newKeyId, timeMs, value, easing: { type: 'linear' as const } }].sort((a, b) => a.timeMs - b.timeMs)
      return { ...timeline, tracks: timeline.tracks.map(item => item === track ? { ...track, keyframes } : item) }
    }) }
  })
}

export function makeMoveAudioClipCmd(layerId: string, startMs: number, options: AudioClipCommandOptions = {}): EditorCommand {
  return transaction('Move Audio Clip', scene => {
    const layer = clip(scene, layerId)
    const source = assetFor(scene, layer.audio.assetId)
    const range = resolveAudioClipWindow(layer, source.durationMs, scene.composition.durationMs)
    const nextStart = Math.max(0, finite(startMs, 'Clip start'))
    const delta = nextStart - range.startMs
    const timelineId = timelineIdFor(scene, layer, options)
    const target = `layers.${layerId}.audio.volume`
    const next: Layer = { ...layer, startMs: nextStart, endMs: nextStart + range.durationMs, audio: { ...layer.audio,
      ...(layer.audio.fadeRange ? { fadeRange: { startMs: layer.audio.fadeRange.startMs + delta, endMs: layer.audio.fadeRange.endMs + delta } } : {}) } }
    return replaceClip({ ...scene, timelines: scene.timelines.map(timeline => timeline.id !== timelineId ? timeline : { ...timeline,
      tracks: timeline.tracks.map(track => track.target !== target ? track : { ...track, keyframes: track.keyframes.map(key => ({ ...key, timeMs: key.timeMs + delta })) }) }) }, next, options)
  })
}

export function makeTrimAudioClipCmd(layerId: string, bounds: { startMs?: number; endMs?: number }, options: AudioClipCommandOptions = {}): EditorCommand {
  return transaction('Trim Audio Clip', scene => {
    const layer = clip(scene, layerId)
    const source = assetFor(scene, layer.audio.assetId)
    const range = resolveAudioClipWindow(layer, source.durationMs, scene.composition.durationMs)
    const desiredStart = finite(bounds.startMs ?? range.startMs, 'Clip start')
    const desiredEnd = finite(bounds.endMs ?? range.endMs, 'Clip end')
    // A left trim moves the source in-point by the same amount. Moving is a separate operation.
    const earliest = layer.audio.loop ? 0 : Math.max(0, range.startMs - range.sourceOffsetMs)
    const startMs = Math.max(earliest, Math.min(desiredStart, desiredEnd - 1))
    const sourceOffsetMs = advanceSourceOffset(layer, range.sourceOffsetMs + startMs - range.startMs, source.durationMs)
    const maxEnd = !layer.audio.loop && source.durationMs !== undefined ? startMs + source.durationMs - sourceOffsetMs : Infinity
    const endMs = Math.min(desiredEnd, maxEnd)
    if (endMs <= startMs) throw new Error('Audio clip must contain at least one millisecond.')
    return replaceClip(scene, clampFades({ ...layer, startMs, endMs, audio: { ...layer.audio, startOffsetMs: sourceOffsetMs } }), options)
  })
}

/** Both halves reference one source and retain their absolute volume envelope. */
export function makeSplitAudioClipCmd(layerId: string, splitMs: number, options: AudioClipCommandOptions & { rightLayerId?: string } = {}): EditorCommand {
  const rightId = options.rightLayerId ?? newClipId()
  const clonedKeyIds = new Map<string, string>()
  return transaction('Split Audio Clip', scene => {
    const layer = clip(scene, layerId)
    const source = assetFor(scene, layer.audio.assetId)
    const range = resolveAudioClipWindow(layer, source.durationMs, scene.composition.durationMs)
    finite(splitMs, 'Split time')
    nonEmptyId(rightId, 'Split clip id')
    if (splitMs <= range.startMs || splitMs >= range.endMs) throw new Error('Split time must be inside the audio clip.')
    if (scene.layers.some(item => item.id === rightId)) throw new Error('Split clip id already exists.')
    const timelineId = timelineIdFor(scene, layer, options)
    const fadeRange = layer.audio.fadeRange ?? { startMs: range.startMs, endMs: range.endMs }
    const left: Layer = { ...layer, endMs: splitMs, audio: { ...layer.audio, fadeRange } }
    const right: Layer = { ...layer, id: rightId, name: `${layer.name} (split)`, startMs: splitMs, endMs: range.endMs,
      audio: { ...layer.audio, startOffsetMs: advanceSourceOffset(layer, range.sourceOffsetMs + splitMs - range.startMs, source.durationMs), fadeRange } }
    const target = `layers.${layerId}.audio.volume`
    const timelines = scene.timelines.map((timeline): Timeline => {
      if (timeline.id !== timelineId) return timeline
      const original = timeline.tracks.find(track => track.target === target)
      const tracks = original ? [...timeline.tracks, { ...original, target: `layers.${rightId}.audio.volume`, keyframes: original.keyframes.map(key => {
        let id = clonedKeyIds.get(key.id)
        if (!id) { id = nextKfId(); clonedKeyIds.set(key.id, id) }
        return { ...key, id }
      }) }] : timeline.tracks
      return { ...timeline, tracks, layerIds: timeline.layerIds === undefined ? undefined : [...timeline.layerIds, rightId] }
    })
    const index = scene.layers.findIndex(item => item.id === layerId)
    return { ...scene, layers: [...scene.layers.slice(0, index), left, right, ...scene.layers.slice(index + 1)], timelines }
  })
}
