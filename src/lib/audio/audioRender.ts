import type { ChronoScene } from '../types'
import { ChronoPlayer } from '../player/ChronoPlayer'
import { audibleAudioLayers, buildAudioClipSchedule } from './audioEvaluation'
import { loadAudioBuffer } from './AudioAssetService'
import { dbToGain, gainToDb, resolveAudioClipWindow } from './audioClip'
import { encodeWav, measurePCM, sourceRangePeak } from './wav'

export interface AudioRenderOptions {
  startMs?: number
  durationMs?: number
  timelineIds?: string[]
  sampleRate?: 44100 | 48000
  maxDurationMs?: number
}

export async function renderAudioMix(scene: ChronoScene, options: AudioRenderOptions = {}) {
  const startMs = options.startMs ?? 0
  const durationMs = options.durationMs ?? scene.composition.durationMs - startMs
  const sampleRate = options.sampleRate ?? 48000
  if (!Number.isFinite(startMs) || startMs < 0 || !Number.isFinite(durationMs) || durationMs <= 0
    || durationMs > (options.maxDurationMs ?? 120000) || ![44100,48000].includes(sampleRate)) throw new Error('Invalid audio range; use a positive range up to the audio export limit')
  if (scene.stateMachines?.length && !options.timelineIds) throw new Error('Specify timelineIds for a deterministic state-machine audio render')
  if (options.timelineIds && (!options.timelineIds.length || options.timelineIds.some(id => !scene.timelines.some(t => t.id === id)))) throw new Error('Audio timeline not found')
  const renderScene = options.timelineIds ? { ...scene, timelines: scene.timelines.filter(t => options.timelineIds!.includes(t.id)), stateMachines: [] } : scene
  const layers = audibleAudioLayers(scene, { timelineIds: options.timelineIds }).filter(layer => {
    const asset = scene.assets.find(a => a.id === layer.audio!.assetId)
    const range = resolveAudioClipWindow(layer, asset?.durationMs, scene.composition.durationMs)
    return range.endMs > startMs && range.startMs < startMs + durationMs
  })
  if (layers.length > 64 || layers.length * durationMs / 5 > 300000) throw new Error('Audio render workload is too large; export a shorter range or fewer clips')
  const context = new OfflineAudioContext(2, Math.ceil(durationMs * sampleRate / 1000), sampleRate)
  const master = context.createGain()
  master.gain.value = scene.composition.audioMuted ? 0 : Math.max(0, Math.min(4, scene.composition.audioVolume ?? 1))
  master.connect(context.destination)
  const schedules = []
  for (const layer of layers) {
    const asset = scene.assets.find(a => a.id === layer.audio!.assetId)
    if (!asset || asset.type !== 'audio') throw new Error(`Audio source missing for '${layer.name}'`)
    const buffer = await loadAudioBuffer(asset)
    const player = new ChronoPlayer(renderScene, null, { loop: false })
    const schedule = buildAudioClipSchedule(layer, buffer.duration * 1000, startMs, startMs + durationMs, {
      // Scope (including shared clips in timeline clones) was resolved above.
      fallbackEndMs: scene.composition.durationMs,
      getOverridesAtTime: time => player.tick(time).overrides,
    })
    if (!schedule) continue
    const source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner()
    source.buffer = buffer; source.loop = schedule.loop; source.playbackRate.value = schedule.sourceRate
    source.connect(gain).connect(pan).connect(master)
    const automate = (param: AudioParam, points: typeof schedule.gainPoints) => {
      if (!points.length) return
      param.setValueAtTime(points[0].value, points[0].timeSec)
      for (const point of points.slice(1)) param.linearRampToValueAtTime(point.value, point.timeSec)
    }
    automate(gain.gain, schedule.gainPoints); automate(pan.pan, schedule.panPoints)
    source.start(schedule.contextStartSec, schedule.sourceOffsetSec)
    source.stop(schedule.stopTimeSec)
    schedules.push({ layerId: layer.id, sourceOffsetSec: schedule.sourceOffsetSec,
      startSec: schedule.contextStartSec, durationSec: schedule.contextDurationSec })
  }
  const buffer = await context.startRendering()
  const stats = measurePCM(buffer)
  const warnings: string[] = []
  if (!schedules.length) warnings.push('No audible audio clips overlap this range; output is silence.')
  if (stats.clippedSamples) warnings.push(`Mix exceeds 0 dBFS (${stats.clippedSamples} samples); lower clip or master gain. PCM WAV samples are clipped to its representable range.`)
  return { bytes: encodeWav(buffer), mimeType: 'audio/wav' as const, startMs, durationMs,
    sampleRate, channels: 2, frames: buffer.length, stats, warnings, clips: schedules }
}

export async function normalizedClipGain(scene: ChronoScene, layerId: string, targetDbFS = -1) {
  const layer = scene.layers.find(l => l.id === layerId && l.type === 'audio')
  if (!layer?.audio) throw new Error('Audio clip not found')
  if (layer.locked) throw new Error('Unlock the audio clip before normalizing')
  if (!Number.isFinite(targetDbFS) || targetDbFS < -24 || targetDbFS > 0) throw new Error('Normalization target must be between -24 and 0 dBFS')
  if (scene.timelines.some(t => t.tracks.some(track => track.target === `layers.${layerId}.audio.volume`))) throw new Error('Remove gain automation before normalizing the static clip gain')
  const asset = scene.assets.find(a => a.id === layer.audio!.assetId && a.type === 'audio')
  if (!asset) throw new Error('Audio source not found')
  const buffer = await loadAudioBuffer(asset)
  const range = resolveAudioClipWindow(layer, buffer.duration * 1000, scene.composition.durationMs)
  const peak = sourceRangePeak(buffer, range.sourceOffsetMs, range.durationMs, !!layer.audio.loop)
  const volume = peak > 0 ? Math.min(4, dbToGain(targetDbFS) / peak) : layer.audio.volume ?? 1
  return { volume, gainDb: gainToDb(volume), sourcePeak: peak, targetDbFS,
    reachedTarget: peak > 0 && Math.abs(peak * volume - dbToGain(targetDbFS)) < 1e-6,
    warnings: peak === 0 ? ['The source range is silent; gain is unchanged.'] : peak * volume + 1e-6 < dbToGain(targetDbFS) ? ['The +12 dB gain limit prevents reaching the requested peak.'] : [] }
}
