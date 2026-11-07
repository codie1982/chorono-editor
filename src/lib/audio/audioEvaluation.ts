import type { ChronoScene, Layer } from '../types'
import type { OverrideMap } from '../evaluator'
import { getLayerValue } from '../evaluator'
import { MAX_AUDIO_GAIN, resolveAudioClipWindow } from './audioClip'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const audioModulo = (value: number, duration: number) => duration > 0 ? ((value % duration) + duration) % duration : 0

export interface AudioEvaluationOptions {
  overrides?: OverrideMap
  /** Undefined: all owners; []: only legacy/global clips. */
  timelineIds?: readonly string[] | null
  fallbackEndMs?: number
  playbackSpeed?: number
  getOverridesAtTime?: (timeMs: number) => OverrideMap
  /** Offline automation sampling; source starts/stops remain exact. */
  automationStepMs?: number
}
export interface EvaluatedAudioClip {
  layerId: string
  assetId: string
  startMs: number
  endMs: number
  sourceOffsetSec: number
  sourceRate: number
  gain: number
  pan: number
  loop: boolean
}
export interface AudioAutomationPoint { timeSec: number; value: number }
export interface AudioClipSchedule {
  layerId: string
  assetId: string
  startMs: number
  endMs: number
  contextStartSec: number
  contextDurationSec: number
  stopTimeSec: number
  sourceOffsetSec: number
  sourceRate: number
  loop: boolean
  gainPoints: AudioAutomationPoint[]
  panPoints: AudioAutomationPoint[]
}

/** Clip timestamps stay on the composition clock. timelineId controls scope,
 * not a second transport clock; undefined ownership remains global. */
export function audibleAudioLayers(scene: ChronoScene, options: Pick<AudioEvaluationOptions, 'timelineIds'> = {}): Layer[] {
  const byId = new Map(scene.layers.map(layer => [layer.id, layer]))
  const requestedTimelines = scene.timelines.filter(timeline => options.timelineIds == null || options.timelineIds.includes(timeline.id))
  const ownerIds = new Set(requestedTimelines.map(timeline => timeline.id))
  const memberIds = new Set(requestedTimelines.flatMap(timeline => timeline.layerIds ?? []))
  const candidates = scene.layers.filter(layer => {
    if (layer.type !== 'audio' || !layer.audio || layer.hidden) return false
    // Timeline clones share visual objects and audio memberships. The original
    // owner remains valid, while explicit clone membership is also playable.
    if (layer.audio.timelineId && !ownerIds.has(layer.audio.timelineId) && !memberIds.has(layer.id)) return false
    const visited = new Set([layer.id])
    let parentId = layer.parentId
    while (parentId) {
      if (visited.has(parentId)) return false
      visited.add(parentId)
      const parent = byId.get(parentId)
      if (!parent || parent.hidden) return false
      parentId = parent.parentId
    }
    return true
  })
  // Solo is an audio-domain operation after visibility and timeline isolation.
  const anySolo = candidates.some(layer => layer.solo)
  return anySolo ? candidates.filter(layer => layer.solo) : candidates
}

/** Pure linear gain, shared by live nodes, waveform overlays and offline mix. */
export function resolveAudioGain(layer: Layer, assetDurationMs: number, timeMs: number,
  options: Pick<AudioEvaluationOptions, 'overrides' | 'fallbackEndMs'> = {}): number {
  if (!layer.audio || layer.audio.muted || layer.hidden) return 0
  const window = resolveAudioClipWindow(layer, assetDurationMs, options.fallbackEndMs)
  if (timeMs < window.startMs || timeMs >= window.endMs) return 0
  const volume = options.overrides
    ? getLayerValue(options.overrides, layer.id, 'audio.volume', layer.audio.volume ?? 1) : layer.audio.volume ?? 1
  const fadeIn = window.fadeInMs > 0 ? clamp((timeMs - window.fadeStartMs) / window.fadeInMs, 0, 1) : 1
  const fadeOut = window.fadeOutMs > 0 ? clamp((window.fadeEndMs - timeMs) / window.fadeOutMs, 0, 1) : 1
  return clamp(Number.isFinite(volume) ? volume : 0, 0, MAX_AUDIO_GAIN) * fadeIn * fadeOut
}

export function evaluateAudioClip(layer: Layer, assetDurationMs: number, timeMs: number,
  options: AudioEvaluationOptions = {}): EvaluatedAudioClip | null {
  if (layer.type !== 'audio' || !layer.audio || layer.hidden || !Number.isFinite(timeMs) || !Number.isFinite(assetDurationMs) || assetDurationMs <= 0) return null
  if (layer.audio.timelineId && options.timelineIds != null && !options.timelineIds.includes(layer.audio.timelineId)) return null
  const window = resolveAudioClipWindow(layer, assetDurationMs, options.fallbackEndMs)
  if (timeMs < window.startMs || timeMs >= window.endMs) return null
  const sourceMs = window.sourceOffsetMs + timeMs - window.startMs
  if (!layer.audio.loop && (sourceMs < 0 || sourceMs >= assetDurationMs)) return null
  const overrides = options.getOverridesAtTime?.(timeMs) ?? options.overrides
  const pan = overrides ? getLayerValue(overrides, layer.id, 'audio.pan', layer.audio.pan ?? 0) : layer.audio.pan ?? 0
  return { layerId: layer.id, assetId: layer.audio.assetId, startMs: window.startMs, endMs: window.endMs,
    sourceOffsetSec: (layer.audio.loop ? audioModulo(sourceMs, assetDurationMs) : sourceMs) / 1000,
    sourceRate: Number.isFinite(options.playbackSpeed) && options.playbackSpeed! > 0 ? options.playbackSpeed! : 1,
    gain: resolveAudioGain(layer, assetDurationMs, timeMs, { ...options, overrides }),
    pan: clamp(Number.isFinite(pan) ? pan : 0, -1, 1), loop: !!layer.audio.loop }
}

/** Source start/offset/stop are exact. Gain/pan are piecewise-linear samples
 * of the same evaluator used live, including fade reference ranges after split. */
export function buildAudioClipSchedule(layer: Layer, assetDurationMs: number, rangeStartMs: number, rangeEndMs: number,
  options: AudioEvaluationOptions = {}): AudioClipSchedule | null {
  if (!layer.audio || rangeEndMs <= rangeStartMs) return null
  const window = resolveAudioClipWindow(layer, assetDurationMs, options.fallbackEndMs)
  const startMs = Math.max(rangeStartMs, window.startMs)
  const endMs = Math.min(rangeEndMs, window.endMs)
  if (endMs <= startMs) return null
  const first = evaluateAudioClip(layer, assetDurationMs, startMs, options)
  if (!first) return null
  const rate = first.sourceRate
  const gainPoints: AudioAutomationPoint[] = [], panPoints: AudioAutomationPoint[] = []
  const times = new Set<number>([startMs, endMs])
  const step = Math.max(1, options.automationStepMs ?? 5)
  for (let time = startMs + step; time < endMs; time += step) times.add(time)
  for (const time of [window.fadeStartMs, window.fadeStartMs + window.fadeInMs,
    window.fadeEndMs - window.fadeOutMs, window.fadeEndMs]) if (time > startMs && time < endMs) times.add(time)
  for (const time of Array.from(times).sort((a, b) => a - b)) {
    // At an artificial preview stop, hold the left-limit gain rather than
    // inventing a fade to zero across the final sampling interval.
    const sampleTime = time === endMs ? Math.max(startMs, time - 1e-6) : time
    const clip = evaluateAudioClip(layer, assetDurationMs, sampleTime, options)!
    const timeSec = (time - rangeStartMs) / 1000 / rate
    gainPoints.push({ timeSec, value: clip?.gain ?? 0 })
    panPoints.push({ timeSec, value: clip?.pan ?? first.pan })
  }
  const contextStartSec = (startMs - rangeStartMs) / 1000 / rate
  const contextDurationSec = (endMs - startMs) / 1000 / rate
  return { layerId: layer.id, assetId: layer.audio.assetId, startMs, endMs, contextStartSec, contextDurationSec,
    stopTimeSec: contextStartSec + contextDurationSec, sourceOffsetSec: first.sourceOffsetSec,
    sourceRate: rate, loop: first.loop, gainPoints, panPoints }
}
