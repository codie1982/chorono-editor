'use client'
import { useState, useRef, useEffect } from 'react'
import type { Timeline } from '@/lib/types'

interface Props {
  timelines: Timeline[]
  selectedTimelineId: string | null
  selectedTimeline: Timeline | null
  currentTimeMs: number
  duration: number
  isPlaying: boolean
  zoomFactor: number
  playbackSpeed: number
  graphEditorMode: boolean
  hasSelectedLayer: boolean
  onPlayToggle: () => void
  onSelectTimeline: (id: string) => void
  onAddTimeline:    () => void
  onDeleteTimeline: (id: string) => void
  onZoomChange:     (z: number) => void
  onFit:            () => void
  onTimelineFieldChange: <K extends keyof Timeline>(key: K, val: Timeline[K]) => void
  onPlaybackSpeedChange: (s: number) => void
  onToggleGraphEditor:   () => void
  /** Snapshot a subset of properties for the selected layer at the playhead. */
  onKeyframeProperties: (properties: string[]) => void
}

const KEYFRAME_PRESETS: Array<{ label: string; props: string[] }> = [
  { label: 'Position (X, Y)',         props: ['transform.x', 'transform.y'] },
  { label: 'Scale (X, Y)',            props: ['transform.scaleX', 'transform.scaleY'] },
  { label: 'Rotation',                props: ['transform.rotationDeg'] },
  { label: 'Opacity',                 props: ['opacity'] },
  { label: 'Transform (all)',         props: ['transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY', 'transform.rotationDeg'] },
  { label: 'All (transform + opacity)', props: ['opacity', 'transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY', 'transform.rotationDeg'] },
]

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2]

/**
 * Top toolbar of the TimelinePanel — playback, zoom, timeline tabs, and the
 * selected timeline's settings (duration / auto / loop).
 */
export default function TimelineToolbar(props: Props) {
  const {
    timelines, selectedTimelineId, selectedTimeline,
    currentTimeMs, duration, isPlaying, zoomFactor, playbackSpeed,
    graphEditorMode, hasSelectedLayer,
    onPlayToggle, onSelectTimeline, onAddTimeline, onDeleteTimeline,
    onZoomChange, onFit, onTimelineFieldChange, onPlaybackSpeedChange,
    onToggleGraphEditor, onKeyframeProperties,
  } = props

  // ── Keyframe dropdown ───────────────────────────────────────────────────
  const [kfMenuOpen, setKfMenuOpen] = useState(false)
  const kfRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!kfMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (kfRef.current && !kfRef.current.contains(e.target as Node)) setKfMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [kfMenuOpen])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 shrink-0">

      <button
        onClick={onPlayToggle}
        className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-mono w-14 text-center"
        title="Play / Pause (Space)"
      >
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>

      <span className="text-xs font-mono text-gray-400 w-24">
        {Math.round(currentTimeMs)} / {duration} ms
      </span>

      {/* Keyframe dropdown — pick which property subset to snapshot */}
      <div ref={kfRef} className="relative">
        <button
          onClick={() => setKfMenuOpen((o) => !o)}
          disabled={!hasSelectedLayer}
          title="Keyframe properties of selected layer at playhead"
          className="px-2 py-1 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-white font-mono
                     disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
                     flex items-center gap-1"
        >
          ◆ Keyframe ▾
        </button>
        {kfMenuOpen && hasSelectedLayer && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl
                          z-50 min-w-[180px] py-1">
            {KEYFRAME_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { onKeyframeProperties(p.props); setKfMenuOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700
                           flex items-center gap-2"
              >
                <span className="text-yellow-400">◆</span>
                <span className="flex-1">{p.label}</span>
                <span className="text-[9px] font-mono text-gray-500">{p.props.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Playback speed */}
      <select
        value={playbackSpeed}
        onChange={(e) => onPlaybackSpeedChange(Number(e.target.value))}
        title="Playback speed"
        className="text-[10px] bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-gray-300 focus:outline-none"
      >
        {SPEED_OPTIONS.map((s) => <option key={s} value={s}>{s}×</option>)}
      </select>

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onZoomChange(Math.max(0.25, zoomFactor / 1.5))}
          className="px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400"
          title="Zoom out"
        >−</button>
        <span className="text-[10px] font-mono text-gray-500 w-10 text-center">
          {zoomFactor.toFixed(1)}×
        </span>
        <button
          onClick={() => onZoomChange(Math.min(20, zoomFactor * 1.5))}
          className="px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400"
          title="Zoom in"
        >+</button>
        <button
          onClick={onFit}
          className="px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400"
          title="Fit"
        >Fit</button>
        <button
          onClick={onToggleGraphEditor}
          title="Toggle graph editor (value vs time)"
          className={`px-2 py-0.5 text-xs rounded text-gray-300 ml-1
            ${graphEditorMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
        >
          ▦
        </button>
      </div>

      {/* Timeline tabs */}
      <div className="flex items-center gap-1 flex-1 overflow-x-auto">
        {timelines.map((tl) => (
          <div key={tl.id} className="flex items-center shrink-0">
            <button
              onClick={() => onSelectTimeline(tl.id)}
              className={`text-xs px-2 py-0.5 rounded-l transition-colors
                ${tl.id === selectedTimelineId
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            >
              {tl.id}
            </button>
            <button
              onClick={() => onDeleteTimeline(tl.id)}
              className="text-xs px-1.5 py-0.5 rounded-r bg-gray-700 hover:bg-red-800 text-gray-500"
              title="Delete timeline"
            >✕</button>
          </div>
        ))}
        <button
          onClick={onAddTimeline}
          className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 ml-1 shrink-0"
        >+ Timeline</button>
      </div>

      {/* Selected timeline settings */}
      {selectedTimeline && (
        <div className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
          <label className="flex items-center gap-1">
            <input type="number" value={selectedTimeline.durationMs} min={100} step={100}
              onChange={(e) => onTimelineFieldChange('durationMs', Number(e.target.value))}
              className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-gray-200
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            /> ms
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={selectedTimeline.autoplay}
              onChange={(e) => onTimelineFieldChange('autoplay', e.target.checked)}
              className="accent-blue-500" />
            auto
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={selectedTimeline.loop}
              onChange={(e) => onTimelineFieldChange('loop', e.target.checked)}
              className="accent-blue-500" />
            loop
          </label>
          <label className="flex items-center gap-1 cursor-pointer" title="Ping-pong: play forward then backward">
            <input type="checkbox" checked={!!selectedTimeline.pingPong}
              onChange={(e) => onTimelineFieldChange('pingPong', e.target.checked)}
              className="accent-blue-500" />
            ↔
          </label>
          <label className="flex items-center gap-1" title="Loop count (0 = infinite)">
            <span className="text-[10px] text-gray-500">×</span>
            <input
              type="number" min={0} step={1}
              value={selectedTimeline.loopCount ?? 0}
              onChange={(e) => onTimelineFieldChange('loopCount', Number(e.target.value))}
              className="w-10 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-gray-200
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
        </div>
      )}
    </div>
  )
}
