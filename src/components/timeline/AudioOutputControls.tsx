'use client'
import { useEffect, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import { dbToGain, gainToDb } from '@/lib/audio/audioClip'
import { renderAudioMix } from '@/lib/audio/audioRender'
import { toast } from '@/lib/toast/toast'

interface Props {
  scene: ChronoScene
  timelineId: string
  onMasterChange: (volume: number) => void
  onMasterMute: (muted: boolean) => void
  getState: () => unknown
  subscribeMeter?: (callback: () => void) => () => void
}
export default function AudioOutputControls({ scene, timelineId, onMasterChange, onMasterMute, getState, subscribeMeter }: Props) {
  const volume = scene.composition.audioVolume ?? 1
  const [draft, setDraft] = useState(volume > 0 ? gainToDb(volume).toFixed(1) : '-60')
  const [peak, setPeak] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(volume > 0 ? gainToDb(volume).toFixed(1) : '-60'), [volume])
  useEffect(() => {
    const sample = () => {
      const state = getState() as { meter?: { peak?: number; peakDbFS?: number | null } }
      const meter = state?.meter
      setPeak(meter?.peakDbFS ?? (meter?.peak ? gainToDb(meter.peak) : null))
    }
    sample()
    const stop = subscribeMeter?.(sample)
    const timer = setInterval(sample, 100)
    return () => { stop?.(); clearInterval(timer) }
  }, [getState, subscribeMeter])
  if (!scene.layers.some(layer => layer.type === 'audio')) return null
  const commit = () => {
    const db = Number(draft)
    if (draft.trim() && Number.isFinite(db)) onMasterChange(dbToGain(Math.max(-60, Math.min(12, db))))
    else setDraft(volume > 0 ? gainToDb(volume).toFixed(1) : '-60')
  }
  const download = async () => {
    setBusy(true)
    try {
      const durationMs = scene.timelines.find(t => t.id === timelineId)?.durationMs ?? scene.composition.durationMs
      const rendered = await renderAudioMix(scene, { durationMs, timelineIds: timelineId ? [timelineId] : undefined })
      const url = URL.createObjectURL(new Blob([rendered.bytes.buffer as ArrayBuffer], { type: rendered.mimeType }))
      const link = document.createElement('a'); link.href = url; link.download = `${scene.composition.id || 'audio'}-${timelineId || 'mix'}.wav`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      if (rendered.warnings.length) toast.warning('Audio exported', { detail: rendered.warnings.join(' ') })
      else toast.success('WAV audio exported')
    } catch (error) { toast.error('Audio export failed', { detail: (error as Error).message }) }
    finally { setBusy(false) }
  }
  return <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-800 bg-gray-950 text-xs text-gray-300" aria-label="Audio output">
    <label className="flex items-center gap-1">Master
      <input aria-label="Master gain dB" type="number" min={-60} max={12} step={.5} value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-16 bg-gray-800 border border-gray-600 rounded px-1 focus:ring-2 focus:ring-blue-500" /> dB
    </label>
    <button type="button" onClick={() => onMasterMute(!scene.composition.audioMuted)} aria-pressed={!!scene.composition.audioMuted}
      className="px-2 rounded border border-gray-700 focus:ring-2 focus:ring-blue-500">{scene.composition.audioMuted ? 'Unmute master' : 'Mute master'}</button>
    <meter aria-label="Master audio peak" min={-60} max={0} value={Math.max(-60, Math.min(0, peak ?? -60))} className="w-20" />
    <span className={peak !== null && peak > 0 ? 'text-red-400' : 'text-gray-400'} aria-live="off">
      {peak === null ? '−∞' : peak.toFixed(1)} dBFS{peak !== null && peak > 0 ? ' · CLIP' : ''}
    </span>
    <button type="button" disabled={busy} onClick={() => void download()} className="ml-auto px-2 rounded border border-gray-600 hover:bg-gray-800 focus:ring-2 focus:ring-blue-500 disabled:opacity-50">{busy ? 'Rendering audio…' : 'Export WAV'}</button>
  </div>
}
