'use client'
import { useState, useCallback, useMemo, useRef } from 'react'
import type { Timeline, Track } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { DopeSheetUIState } from './types'
import DopeSheetKeyframeRow from './DopeSheetKeyframeRow'

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
  // Zoom/pan state (reuse timeline viewport logic)
  const [zoomFactor, setZoomFactor] = useState(1)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const tracks = selectedTimeline?.tracks || []
  const durationMs = selectedTimeline?.durationMs || 1000

  // Utility: convert time to screen pixels
  const msToScreenPx = useCallback(
    (timeMs: number) => {
      const secondsWidth = 60 // pixels per second
      const pixelsPerSecond = secondsWidth * zoomFactor
      return (timeMs / 1000) * pixelsPerSecond - scrollLeftPx
    },
    [zoomFactor, scrollLeftPx],
  )

  // Utility: convert screen pixel to time
  const screenPxToMs = useCallback(
    (px: number) => {
      const secondsWidth = 60
      const pixelsPerSecond = secondsWidth * zoomFactor
      return ((px + scrollLeftPx) / pixelsPerSecond) * 1000
    },
    [zoomFactor, scrollLeftPx],
  )

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return

    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoomFactor(prev => Math.max(0.25, Math.min(20, prev * delta)))
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
      {/* Time ruler */}
      <div className="grid-ruler-row">
        <div className="time-ruler">
          {/* Simple time marks */}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sec => {
            const timeMs = sec * 1000
            const xPos = msToScreenPx(timeMs)
            return (
              <div
                key={sec}
                className="time-mark"
                style={{ left: `${xPos}px` }}
                onClick={() => onTimeChange(timeMs)}
              >
                {sec}s
              </div>
            )
          })}
          {/* Current time indicator line on ruler */}
          <div
            className="ruler-playhead"
            style={{
              left: `${msToScreenPx(currentTimeMs)}px`,
            }}
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

      {/* Current time indicator */}
      <div
        className="current-time-indicator"
        style={{
          left: `${msToScreenPx(currentTimeMs)}px`,
        }}
      />
    </div>
  )
}
