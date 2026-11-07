import type { Layer, Track } from '@/lib/types'
import { makeSetAudioGainKeyCmd } from '@/lib/editor/commands-audio'
import { evaluateTrack } from '@/lib/evaluator'

export function audioGainAtPlayhead(layer: Layer, tracks: Track[], timeMs: number): number {
  const track = tracks.find(item => item.target === `layers.${layer.id}.audio.volume`)
  const value = track?.keyframes.length ? evaluateTrack(track, timeMs) : layer.audio?.volume ?? 1
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : layer.audio?.volume ?? 1
}

/** The shared audio command preserves existing keys and creates missing tracks. */
export function audioGainKeyCommand(layer: Layer, timelineId: string, timeMs: number, gain = layer.audio?.volume ?? 1) {
  return makeSetAudioGainKeyCmd(layer.id, timeMs, gain, { timelineId })
}
