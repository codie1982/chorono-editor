'use client'
import type { AudioData, Layer } from '@/lib/types'
import { dbToGain, gainToDb } from '@/lib/audio/audioClip'
import AudioNumberField from './AudioNumberField'

export default function AudioClipControls({ layer, onPatch, onSolo, gain, onGainCommit }: {
  layer: Layer; onPatch: (patch: Partial<AudioData>) => void; onSolo: () => void;
  gain?: number; onGainCommit?: (gain: number) => void;
}) {
  if (!layer.audio) return null
  const audio = layer.audio
  const db = gainToDb(gain ?? audio.volume ?? 1)
  return <div className="flex items-center gap-1.5 min-w-0" onClick={event => event.stopPropagation()}>
    <button type="button" aria-label={`Mute ${layer.name}`} aria-pressed={!!audio.muted} disabled={layer.locked}
      onClick={() => onPatch({ muted: !audio.muted })}
      className={`px-1.5 py-0.5 rounded text-[10px] border ${audio.muted ? 'border-amber-600 text-amber-200 bg-amber-900/30' : 'border-gray-700 text-gray-400'}`}>M</button>
    <button type="button" aria-label={`Solo ${layer.name}`} aria-pressed={!!layer.solo} disabled={layer.locked}
      onClick={onSolo} className={`px-1.5 py-0.5 rounded text-[10px] border ${layer.solo ? 'border-blue-600 text-blue-200 bg-blue-900/30' : 'border-gray-700 text-gray-400'}`}>S</button>
    <AudioNumberField compact label={`${layer.name} gain in dB`} value={Number.isFinite(db) ? Math.max(-60, Math.min(12, db)) : -60}
      min={-60} max={12} step={0.5} suffix="dB" disabled={layer.locked}
      onCommit={value => onGainCommit ? onGainCommit(dbToGain(value)) : onPatch({ volume: dbToGain(value) })} />
    {(gain ?? audio.volume ?? 1) === 0 && <span className="text-[9px] text-gray-500">−∞</span>}
  </div>
}
