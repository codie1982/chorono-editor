'use client'
import { useState } from 'react'
import type { ChronoScene, Layer, AudioData } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeMoveAudioClipCmd, makePatchAudioClipCmd, makeSplitAudioClipCmd, makeTrimAudioClipCmd } from '@/lib/editor/commands-audio'
import { dbToGain, gainToDb, resolveAudioClipWindow } from '@/lib/audio/audioClip'
import { audioGainAtPlayhead, audioGainKeyCommand } from './audioGainKeyCommand'
import AudioNumberField from './AudioNumberField'

export default function AudioInspector({ layer, scene, currentTimeMs = 0, selectedTimelineId, dispatchCommand, onNormalizeAudio }: {
  layer: Layer; scene: ChronoScene; currentTimeMs?: number; selectedTimelineId?: string | null;
  dispatchCommand: (command: EditorCommand) => void; onNormalizeAudio?: (layerId: string) => void | Promise<void>;
}) {
  const [normalizing, setNormalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!layer.audio) return null
  const audio = layer.audio
  const asset = scene.assets.find(item => item.id === audio.assetId)
  const timelineId = audio.timelineId ?? selectedTimelineId ?? undefined
  const timeline = scene.timelines.find(item => item.id === timelineId)
  const window = resolveAudioClipWindow(layer, asset?.durationMs, timeline?.durationMs ?? scene.composition.durationMs)
  const options = { timelineId }
  const apply = (command: EditorCommand) => {
    if (layer.locked) return
    setError(null)
    try { dispatchCommand(command) } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  const patch = (data: Partial<AudioData>) => apply(makePatchAudioClipCmd(layer.id, data, options))
  const volumeTrack = timeline?.tracks.find(track => track.target === `layers.${layer.id}.audio.volume`)
  const automated = !!volumeTrack?.keyframes.length
  const displayedGain = audioGainAtPlayhead(layer, timeline?.tracks ?? [], currentTimeMs)
  const gainDb = gainToDb(displayedGain)
  const changeGain = (gain: number) => automated && timelineId
    ? apply(audioGainKeyCommand(layer, timelineId, currentTimeMs, gain)) : patch({ volume: gain })
  const canSplit = !layer.locked && currentTimeMs > window.startMs && currentTimeMs < window.endMs
  const field = (label: string, value: number, onCommit: (next: number) => void, max?: number, min = 0, suffix = 'ms') =>
    <AudioNumberField label={label} value={value} onCommit={onCommit} min={min} max={max}
      step={suffix === 'dB' ? .5 : label === 'Pan' ? .1 : 1} disabled={layer.locked} suffix={suffix} />
  return <section className="space-y-3" aria-label="Audio clip inspector">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Audio clip</div>
    <p className="text-xs text-gray-300 truncate" title={asset?.name}>{asset?.name ?? 'Missing audio asset'}</p>
    {layer.locked && <p className="text-[11px] text-amber-300">Unlock this clip to edit it.</p>}
    <div className="grid grid-cols-2 gap-2">
      {field('Start', window.startMs, startMs => apply(makeMoveAudioClipCmd(layer.id, startMs, options)))}
      {field('Duration', window.durationMs, duration => apply(makeTrimAudioClipCmd(layer.id, { endMs: window.startMs + duration }, options)), undefined, 1)}
      {field('End', window.endMs, endMs => apply(makeTrimAudioClipCmd(layer.id, { endMs }, options)), undefined, window.startMs + 1)}
      {field('Source in', window.sourceOffsetMs, startOffsetMs => patch({ startOffsetMs }), asset?.durationMs)}
      {field('Gain', Number.isFinite(gainDb) ? Math.max(-60, Math.min(12, gainDb)) : -60, value => changeGain(dbToGain(value)), 12, -60, 'dB')}
      {field('Pan', audio.pan ?? 0, pan => patch({ pan }), 1, -1, '')}
      {field('Fade in', window.fadeInMs, fadeInMs => patch({ fadeInMs }), window.durationMs)}
      {field('Fade out', window.fadeOutMs, fadeOutMs => patch({ fadeOutMs }), window.durationMs)}
    </div>
    {automated && <p className="text-[10px] text-amber-300">Gain is automated. Level edits add a key at the playhead.</p>}
    <p className="text-[10px] text-gray-500">Source out: {Math.round(window.sourceEndMs)} ms{asset?.durationMs ? ` / ${Math.round(asset.durationMs)} ms` : ''}{displayedGain === 0 ? ' · Gain: −∞ dB' : ''}</p>
    <div className="flex items-center gap-4 text-xs text-gray-300">
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!audio.muted} disabled={layer.locked}
        onChange={event => patch({ muted: event.target.checked })} />Mute</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!audio.loop} disabled={layer.locked}
        onChange={event => patch({ loop: event.target.checked })} />Loop</label>
      <button type="button" disabled={layer.locked} onClick={() => changeGain(0)}
        className="text-[10px] text-gray-400 hover:text-white disabled:opacity-40">Silence</button>
    </div>
    <label className="flex flex-col gap-1 text-[10px] text-gray-400">Timeline
      <select aria-label="Audio clip timeline" value={audio.timelineId ?? ''} disabled={layer.locked}
        className="bg-gray-950 border border-gray-700 rounded p-1 text-xs text-gray-200"
        onChange={event => patch({ timelineId: event.target.value || undefined })}>
        <option value="">Global</option>
        {scene.timelines.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!canSplit} onClick={() => apply(makeSplitAudioClipCmd(layer.id, currentTimeMs, options))}
        className="px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 disabled:opacity-40">Split at playhead</button>
      <button type="button" disabled={layer.locked || !timelineId} onClick={() => {
        if (!timelineId) return
        apply(audioGainKeyCommand(layer, timelineId, currentTimeMs, displayedGain))
      }} className="px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 disabled:opacity-40">Key gain at playhead</button>
      {onNormalizeAudio && <button type="button" disabled={layer.locked || normalizing} onClick={async () => {
        setNormalizing(true); setError(null)
        try { await onNormalizeAudio(layer.id) } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
        finally { setNormalizing(false) }
      }} className="px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 disabled:opacity-40">
        {normalizing ? 'Analyzing…' : 'Normalize to −1 dBFS'}
      </button>}
    </div>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </section>
}
