'use client'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Timeline, Track } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { DopeSheetUIState } from './types'
import DopeSheetKeyframeRow from './DopeSheetKeyframeRow'

const LABEL_COL_WIDTH = 220 // must match .track-label / .ruler-label-spacer width
const BASE_PX_PER_SEC = 60

interface Props {
  selectedTimeline: Timeline
  selectedKfIds: Set<string>
  onSelectKeyframes: (kfIds: Set<string>) => void
  currentTimeMs: number
  isPlaying: boolean
  onTimeChange: (ms: number) => void
  editor: EditorStateReturn
  uiState: DopeSheetUIState
  onUpdateUIState: (state: DopeSheetUIState) => void
}

const ROW_HEIGHT = 28

export default function DopeSheetGrid({
  selectedTimeline,
  selectedKfIds,
  onSelectKeyframes,
  currentTimeMs,
  isPlaying,
  onTimeChange,
  editor,
  uiState,
  onUpdateUIState,
}: Props) {
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  // Measured width of the key area (grid width minus the label column).
  const [keyAreaPx, setKeyAreaPx] = useState(0)
  // User wheel-zoom multiplier on top of the auto-fit zoom (1 = full fit).
  const [userZoom, setUserZoom] = useState(1)

  const tracks = selectedTimeline?.tracks || []
  const durationMs = selectedTimeline?.durationMs || 1000

  // Track the available key-area width via ResizeObserver so the fit zoom
  // recomputes on panel/viewport resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setKeyAreaPx(Math.max(0, el.clientWidth - LABEL_COL_WIDTH))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Reset to full-fit when a different timeline (duration) loads.
  useEffect(() => { setUserZoom(1); setScrollLeftPx(0) }, [durationMs])

  // Auto-fit zoom: spread the whole duration across the key area, then apply
  // the user's wheel-zoom multiplier on top.
  const zoomFactor = useMemo(() => {
    const avail = keyAreaPx - 24
    const fit = avail > 0 && durationMs > 0
      ? avail / ((durationMs / 1000) * BASE_PX_PER_SEC)
      : 1
    return Math.max(0.05, Math.min(40, fit * userZoom))
  }, [keyAreaPx, durationMs, userZoom])

  // Utility: convert time to screen pixels
  const msToScreenPx = useCallback(
    (timeMs: number) => {
      const pixelsPerSecond = BASE_PX_PER_SEC * zoomFactor
      return (timeMs / 1000) * pixelsPerSecond - scrollLeftPx
    },
    [zoomFactor, scrollLeftPx],
  )

  // Utility: convert screen pixel to time
  const screenPxToMs = useCallback(
    (px: number) => {
      const pixelsPerSecond = BASE_PX_PER_SEC * zoomFactor
      return ((px + scrollLeftPx) / pixelsPerSecond) * 1000
    },
    [zoomFactor, scrollLeftPx],
  )

  // Ruler ticks across the duration, snapped to a "nice" step (~8 ticks).
  const ticks = useMemo(() => {
    const target = 8
    const raw = durationMs / target
    const nice = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000]
    const step = nice.find(s => s >= raw) ?? 60000
    const arr: number[] = []
    for (let t = 0; t <= durationMs + 0.5; t += step) arr.push(t)
    return arr
  }, [durationMs])

  const fmtTick = (ms: number) =>
    ms >= 1000 ? `${+(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`

  // Handle wheel zoom (multiplier on top of auto-fit)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return

    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setUserZoom(prev => Math.max(0.1, Math.min(8, prev * delta)))
  }, [])

  const [dragPreviewMs, setDragPreviewMs] = useState<Record<string, number>>({})

  // Handle key selection (click in empty area or on key)
  const handleSelectKey = useCallback(
    (kfId: string, shiftKey: boolean, ctrlKey: boolean) => {
      const newSet = new Set(selectedKfIds)

      if (ctrlKey) {
        // Toggle
        if (newSet.has(kfId)) {
          newSet.delete(kfId)
        } else {
          newSet.add(kfId)
        }
      } else if (shiftKey) {
        // Add to selection
        newSet.add(kfId)
      } else {
        // Replace selection
        newSet.clear()
        newSet.add(kfId)
      }

      onSelectKeyframes(newSet)
    },
    [selectedKfIds, onSelectKeyframes],
  )

  // Handle drag start
  const handleDragStart = useCallback((e: React.PointerEvent, kfId: string) => {
    e.preventDefault()
    // For now, just mark as dragging; full drag handled via pointer events
  }, [])

  // Handle drag move (update preview)
  const handleDragMove = useCallback((deltaMs: number) => {
    const preview: Record<string, number> = {}
    for (const track of tracks) {
      if (!track.keyframes) continue
      for (const kf of track.keyframes) {
        if (selectedKfIds.has(kf.id)) {
          preview[kf.id] = Math.max(0, Math.min(durationMs, kf.timeMs + deltaMs))
        }
      }
    }
    setDragPreviewMs(preview)
  }, [tracks, selectedKfIds, durationMs])

  // Handle drag end (commit via command)
  const handleDragEnd = useCallback((deltaMs: number) => {
    if (deltaMs === 0) {
      setDragPreviewMs({})
      return
    }

    // For now, just clear preview
    // Full undo/redo integration in Phase 5
    setDragPreviewMs({})
  }, [])

  // Visible time range (for rendering optimization)
  const visibleStartMs = screenPxToMs(0)
  const visibleEndMs = screenPxToMs(containerRef.current?.clientWidth || 800)

  const totalContentPx = useMemo(() => {
    const secondsWidth = 60
    const pixelsPerSecond = secondsWidth * zoomFactor
    return (durationMs / 1000) * pixelsPerSecond
  }, [durationMs, zoomFactor])

  return (
    <div className="dope-sheet-grid" ref={containerRef} onWheel={handleWheel}>
      {/* Time ruler (horizontal) */}
      <div className="grid-ruler-row">
        <div className="ruler-label-spacer">Tracks</div>
        <div className="time-ruler">
          {ticks.map(t => (
            <div
              key={t}
              className="time-mark"
              style={{ left: `${msToScreenPx(t)}px` }}
              onClick={() => onTimeChange(t)}
            >
              {fmtTick(t)}
            </div>
          ))}
          {/* Current time indicator line on ruler */}
          <div
            className="ruler-playhead"
            style={{ left: `${msToScreenPx(currentTimeMs)}px` }}
          />
        </div>
      </div>

      {/* Keyframe rows (scrollable) */}
      <div className="grid-rows-container">
        <div
          className="grid-rows"
          style={{
            width: totalContentPx + 'px',
            minWidth: '100%',
          }}
        >
          {tracks.length > 0 ? (
            tracks.map(track => (
              <DopeSheetKeyframeRow
                key={track.target}
                track={track}
                selectedKfIds={selectedKfIds}
                previewMs={dragPreviewMs}
                onSelectKey={handleSelectKey}
                onDragStart={handleDragStart}
                msToScreenPx={msToScreenPx}
                visibleStartMs={visibleStartMs}
                visibleEndMs={visibleEndMs}
              />
            ))
          ) : (
            <div className="grid-empty">No tracks in timeline</div>
          )}
        </div>
      </div>

      {/* Current time indicator (offset past the track-label column) */}
      <div
        className="current-time-indicator"
        style={{
          left: `${LABEL_COL_WIDTH + msToScreenPx(currentTimeMs)}px`,
        }}
      />
    </div>
  )
}
