'use client'
import { useState, useRef, useCallback } from 'react'
import type { Timeline, TimelineMode, AutoKeyMode } from '@/lib/types'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import TimelineGhostControl from './TimelineGhostControl'
import { useClickOutside } from './hooks/useClickOutside'

interface Props {
  timelines: Timeline[]
  selectedTimelineId: string | null
  selectedTimeline: Timeline | null
  currentTimeMs: number
  duration: number
  isPlaying: boolean
  zoomFactor: number
  playbackSpeed: number
  timelineMode: TimelineMode
  autoKeyMode: AutoKeyMode
  onAutoKeyModeChange: (mode: AutoKeyMode) => void
  hasSelectedLayer: boolean
  onPlayToggle: () => void
  /** Jump the playhead to the previous / next keyframe. */
  onPrevKeyframe: () => void
  onNextKeyframe: () => void
  onSelectTimeline: (id: string) => void
  onAddTimeline:    () => void
  onDeleteTimeline: (id: string) => void
  getTimelineDeleteReason?: (id: string) => string | null
  onZoomChange:     (z: number) => void
  onFit:            () => void
  onTimelineFieldChange: <K extends keyof Timeline>(key: K, val: Timeline[K]) => void
  onPlaybackSpeedChange: (s: number) => void
  onModeChange: (mode: TimelineMode) => void
  /** Snapshot a subset of properties for the selected layer at the playhead. */
  onKeyframeProperties: (properties: string[]) => void
  /** BL-56 — Ghost / Onion-Skin settings (playhead-relative frame preview) */
  ghostSettings: TimelineGhostSettings
  selectedLayerIds: Set<string>
  onGhostUpdate: (patch: Partial<TimelineGhostSettings>) => void
  onGhostToggle: () => void
  onGhostPreset: (preset: 'off' | 'light' | 'medium' | 'heavy') => void
  /** BL-11 — Toggle work area: create covering full duration if none, clear if set. */
  onToggleWorkArea?: () => void
  /** BL-11 — True when work area is currently defined (changes button look). */
  workAreaActive?: boolean
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
    timelineMode, autoKeyMode, onAutoKeyModeChange, hasSelectedLayer,
    onPlayToggle, onPrevKeyframe, onNextKeyframe,
    onSelectTimeline, onAddTimeline, onDeleteTimeline,
    getTimelineDeleteReason,
    onZoomChange, onFit, onTimelineFieldChange, onPlaybackSpeedChange,
    onModeChange, onKeyframeProperties,
    ghostSettings, selectedLayerIds,
    onGhostUpdate, onGhostToggle, onGhostPreset,
    onToggleWorkArea, workAreaActive,
  } = props

  // ── Keyframe dropdown ───────────────────────────────────────────────────
  const [kfMenuOpen, setKfMenuOpen] = useState(false)
  const kfRef = useRef<HTMLDivElement>(null)
  useClickOutside(kfRef, kfMenuOpen, () => setKfMenuOpen(false))

  // ── Play-type dropdown (long-press the Play button) ──────────────────────
  const [playMenuOpen, setPlayMenuOpen] = useState(false)
  const playRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  useClickOutside(playRef, playMenuOpen, () => setPlayMenuOpen(false))
  const onPlayPointerDown = useCallback(() => {
    longPressed.current = false
    pressTimer.current = setTimeout(() => { longPressed.current = true; setPlayMenuOpen(true) }, 400)
  }, [])
  const onPlayPointerUp = useCallback(() => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
    if (!longPressed.current) onPlayToggle()  // short press → play/pause
  }, [onPlayToggle])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 shrink-0">

      <div className="relative" ref={playRef}>
        <button
          onPointerDown={onPlayPointerDown}
          onPointerUp={onPlayPointerUp}
          onPointerLeave={() => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null } }}
          className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-mono w-14 text-center"
          title="Play / Pause (Space) · long-press for play mode"
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        {playMenuOpen && selectedTimeline && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded shadow-xl p-2 flex flex-col gap-1 text-xs text-gray-300 w-44">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 pb-0.5">Play Mode</div>
            <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 hover:bg-gray-800 rounded">
              <input type="checkbox" checked={selectedTimeline.autoplay}
                onChange={(e) => onTimelineFieldChange('autoplay', e.target.checked)}
                className="accent-blue-500" />
              Autoplay
            </label>
            <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 hover:bg-gray-800 rounded">
              <input type="checkbox" checked={selectedTimeline.loop}
                onChange={(e) => onTimelineFieldChange('loop', e.target.checked)}
                className="accent-blue-500" />
              Loop
            </label>
            <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 hover:bg-gray-800 rounded"
                   title="Play forward then backward">
              <input type="checkbox" checked={!!selectedTimeline.pingPong}
                onChange={(e) => onTimelineFieldChange('pingPong', e.target.checked)}
                className="accent-blue-500" />
              Ping-pong (↔)
            </label>
            <label className="flex items-center gap-2 px-1 py-0.5" title="Loop count (0 = infinite)">
              <span className="text-gray-500 flex-1">Loop count</span>
              <input type="number" min={0} step={1} value={selectedTimeline.loopCount ?? 0}
                onChange={(e) => onTimelineFieldChange('loopCount', Number(e.target.value))}
                className="w-12 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-gray-200
                           [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
            </label>
          </div>
        )}
      </div>

      {/* Jump to previous / next keyframe */}
      <div className="flex items-center rounded overflow-hidden border border-gray-600 shrink-0">
        <button
          onClick={onPrevKeyframe}
          className="px-1.5 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white font-mono"
          title="Previous keyframe (,)"
        >◀◆</button>
        <button
          onClick={onNextKeyframe}
          className="px-1.5 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white font-mono border-l border-gray-600"
          title="Next keyframe (.)"
        >◆▶</button>
      </div>

      <span className="text-xs font-mono text-gray-400 w-24">
        {Math.round(currentTimeMs)} / {duration} ms
      </span>

      {/* Auto-key / Record mode selector (BL-41) */}
      <div className="flex items-center rounded overflow-hidden border border-gray-600 shrink-0">
        {([
          { id: 'manual', label: 'Manual', title: 'Manual — keyframes only when you press K',
            active: 'bg-gray-700 text-white', dot: '◇' },
          { id: 'auto',   label: 'Auto',   title: 'Auto Key — property edits auto-write keyframes',
            active: 'bg-yellow-700 text-white', dot: '◆' },
          { id: 'record', label: 'REC',    title: 'Record — same as Auto, visually emphasised for live tweaking',
            active: 'bg-red-700 text-white', dot: '●' },
        ] as const).map((m) => (
          <button
            key={m.id}
            onClick={() => onAutoKeyModeChange(m.id)}
            title={m.title}
            className={`px-2 py-0.5 text-[10px] font-mono transition-colors
              ${autoKeyMode === m.id
                ? m.active
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            <span className="mr-0.5">{m.dot}</span>{m.label}
          </button>
        ))}
      </div>

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

      {/* View mode tabs: Dope Sheet / Curve / Segments */}
      <div className="flex items-center rounded overflow-hidden border border-gray-600 shrink-0">
        {([
          { id: 'dope',     label: 'Dope',  title: 'Dope Sheet — keyframe timing' },
          { id: 'curve',    label: 'Curve', title: 'Curve Editor — value graph' },
          { id: 'segments', label: 'Seg',   title: 'Segments view' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => onModeChange(tab.id)}
            title={tab.title}
            className={`px-2 py-0.5 text-[10px] font-mono transition-colors
              ${timelineMode === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* BL-56 — Ghost / Onion-Skin control */}
      <TimelineGhostControl
        ghostSettings={ghostSettings}
        selectedLayerIds={selectedLayerIds}
        onUpdateSettings={onGhostUpdate}
        onToggle={onGhostToggle}
        onApplyPreset={onGhostPreset}
      />

      {/* BL-11 — Work area toggle (create / clear) */}
      {onToggleWorkArea && (
        <button
          onClick={onToggleWorkArea}
          title={workAreaActive
            ? 'Clear work area  [ ]'
            : 'Create work area covering the full duration · drag the brackets to adjust  [ ]'}
          className={`px-2 py-1 text-[10px] rounded font-mono border transition-colors ${
            workAreaActive
              ? 'bg-sky-700 hover:bg-sky-600 text-white border-sky-500'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600'
          }`}
        >
          [ ] Work
        </button>
      )}

      {/* Zoom slider (replaces cursor-anchored wheel zoom — see useTimelineViewport).
          Logarithmic mapping so 1× sits near the middle of the track. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-gray-600 select-none">Zoom</span>
        <input
          type="range"
          min={0} max={100} step={1}
          value={zoomToSlider(zoomFactor)}
          onChange={(e) => onZoomChange(sliderToZoom(Number(e.target.value)))}
          className="w-28 accent-blue-500 cursor-pointer"
          title={`${zoomFactor.toFixed(2)}× — drag to scale timeline`}
        />
        <span className="text-[10px] font-mono text-gray-500 w-10 text-right">
          {zoomFactor.toFixed(zoomFactor < 1 ? 2 : 1)}×
        </span>
        <button
          onClick={onFit}
          className="px-2 py-0.5 text-[10px] rounded bg-gray-700 hover:bg-gray-600 text-gray-400"
          title="Fit (1×)"
        >Fit</button>
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
              disabled={!!getTimelineDeleteReason?.(tl.id)}
              className="text-xs px-1.5 py-0.5 rounded-r bg-gray-700 hover:bg-red-800 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title={getTimelineDeleteReason?.(tl.id) ?? 'Delete timeline'}
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
          {/* Play mode (autoplay / loop / ping-pong / loop count) now lives in
              the Play button's long-press dropdown. */}
        </div>
      )}
    </div>
  )
}

// ── Zoom slider mapping ──────────────────────────────────────────────────
// Slider runs [0, 100] in UI space. Zoom factor runs [MIN_ZOOM, MAX_ZOOM]
// in log space so 1× lands near the middle of the slider track (instead of
// the far left, which would happen with a linear map given MAX is 20).
const MIN_ZOOM = 0.25
const MAX_ZOOM = 20
const LOG_RANGE = Math.log(MAX_ZOOM / MIN_ZOOM)
function zoomToSlider(zoom: number): number {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
  return (Math.log(z / MIN_ZOOM) / LOG_RANGE) * 100
}
function sliderToZoom(s: number): number {
  const t = Math.max(0, Math.min(100, s)) / 100
  return MIN_ZOOM * Math.exp(t * LOG_RANGE)
}
