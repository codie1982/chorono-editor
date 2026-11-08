'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChronoScene, Timeline, TimelineSettings } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { useDopeSheetKeyDrag } from '@/app/hooks/useDopeSheetKeyDrag'
import { makeBulkMoveKfCmd } from '@/lib/editor/commands-keyframe'
import { dopeSheetTickStep, keysInDopeSheetBox, selectDopeSheetKeys } from '@/lib/dope-sheet/rows'
import DopeSheetHierarchy from './DopeSheetHierarchy'
import DopeSheetKeyframeRow from './DopeSheetKeyframeRow'
import { RowLayout } from '@/lib/editor/virtualization/RowLayout'
import { useRowWindow } from '@/components/virtualization/useRowWindow'
import { WindowedRows } from '@/components/virtualization/WindowedRows'
import { DOPE_SHEET_LABEL_WIDTH as LABEL_WIDTH, DOPE_SHEET_ROW_HEIGHT as ROW_HEIGHT,
  DOPE_SHEET_RULER_HEIGHT as RULER_HEIGHT, type DopeSheetRow, type DopeSheetUIState } from './types'

interface Props {
  scene: ChronoScene
  selectedTimeline: Timeline
  editor: EditorStateReturn
  settings: TimelineSettings
  rows: DopeSheetRow[]
  selectedLayerId: string | null
  selectedKfIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  onSelectLayer: (id: string | null) => void
  onSelectKeyframes: (ids: Set<string>) => void
  currentTimeMs: number
  isPlaying: boolean
  onTimeChange: (ms: number) => void
  uiState: DopeSheetUIState
}

interface Box { x1: number; y1: number; x2: number; y2: number }

export default function DopeSheetGrid(props: Props) {
  const { selectedTimeline: timeline, editor, selectedKfIds, onSelectKeyframes } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const baseSceneRef = useRef<ChronoScene | null>(null)
  const interactionCleanupRef = useRef<(() => void) | null>(null)
  const layout = useMemo(() => RowLayout.fixed(props.rows.length, ROW_HEIGHT), [props.rows.length])
  const rowKeys = useMemo(() => props.rows.map(row => row.node.id), [props.rows])
  const windowed = useRowWindow(layout, rowKeys, scrollRef, rowsRef)
  const viewport = windowed.viewport
  const [userZoom, setUserZoom] = useState(1)
  const [box, setBox] = useState<Box | null>(null)
  const durationMs = Math.max(1, timeline.durationMs)
  const pixelsPerMs = Math.max(160, viewport.width - LABEL_WIDTH - 24) * userZoom / durationMs
  const timeAreaWidth = Math.max(viewport.width - LABEL_WIDTH, durationMs * pixelsPerMs + 24)
  const gridStepMs = dopeSheetTickStep(durationMs)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const wheel = (event: WheelEvent) => {
      if (!event.shiftKey) return
      event.preventDefault()
      setUserZoom(zoom => Math.max(0.25, Math.min(8, zoom * (event.deltaY > 0 ? 0.9 : 1.1))))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { el.removeEventListener('wheel', wheel) }
  }, [])

  useEffect(() => {
    setUserZoom(1)
    setBox(null)
    if (scrollRef.current) { scrollRef.current.scrollLeft = 0; scrollRef.current.scrollTop = 0 }
    return () => interactionCleanupRef.current?.()
  }, [timeline.id, durationMs])

  const drag = useDopeSheetKeyDrag({
    timeline, settings: props.settings, frameRate: props.scene.composition.frameRate,
    pixelsPerMs, gridStepMs, enabled: !props.isPlaying,
    onDragStart: () => { baseSceneRef.current = editor.getScene(); editor.beginTransaction() },
    onDragMove: update => {
      if (baseSceneRef.current) editor.previewTransaction(makeBulkMoveKfCmd(update.moves).execute(baseSceneRef.current))
    },
    onDragEnd: moves => { editor.commitTransaction(makeBulkMoveKfCmd(moves)); baseSceneRef.current = null },
    onCancel: () => { editor.cancelTransaction(); baseSceneRef.current = null },
  })

  const selectKey = (ids: string[], shift: boolean, toggle: boolean) =>
    onSelectKeyframes(selectDopeSheetKeys(selectedKfIds, ids, shift, toggle))

  const keyPointerDown = (event: React.PointerEvent<HTMLElement>, ids: string[]) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    // Pointer prevention keeps the drag stable; move keyboard focus out of search explicitly.
    event.currentTarget.focus({ preventScroll: true })
    interactionCleanupRef.current?.()
    if (event.ctrlKey || event.metaKey) { selectKey(ids, event.shiftKey, true); return }
    const next = event.shiftKey ? new Set(Array.from(selectedKfIds).concat(ids))
      : ids.every(id => selectedKfIds.has(id)) ? new Set(selectedKfIds) : new Set(ids)
    onSelectKeyframes(next)
    drag.beginDrag(event, ids[0], next, () => {
      if (!event.shiftKey) onSelectKeyframes(new Set(ids))
    })
  }

  const contentPoint = (clientX: number, clientY: number) => {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    return { x: Math.max(0, clientX - rect.left + el.scrollLeft - LABEL_WIDTH),
      y: Math.max(0, clientY - rect.top + el.scrollTop - RULER_HEIGHT) }
  }

  const beginMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.isDragging || props.isPlaying) return
    event.preventDefault()
    event.stopPropagation()
    scrollRef.current?.focus({ preventScroll: true })
    interactionCleanupRef.current?.()
    const start = contentPoint(event.clientX, event.clientY)
    const original = new Set(selectedKfIds)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const initial = additive ? original : new Set<string>()
    if (!additive) onSelectKeyframes(initial)
    const pointerId = event.pointerId
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      const end = contentPoint(e.clientX, e.clientY)
      const nextBox = { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
      setBox(nextBox)
      const hits = keysInDopeSheetBox(props.rows, nextBox, pixelsPerMs, ROW_HEIGHT)
      onSelectKeyframes(new Set(Array.from(initial).concat(Array.from(hits))))
    }
    const clear = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      interactionCleanupRef.current = null
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      // A plain click in empty space clears selection; do not turn it into a
      // zero-size rectangle that could accidentally re-select a nearby key.
      if (Math.abs(e.clientX - event.clientX) + Math.abs(e.clientY - event.clientY) > 2) move(e)
      setBox(null); clear()
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      onSelectKeyframes(original); setBox(null); clear()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation()
      onSelectKeyframes(original); setBox(null); clear()
    }
    interactionCleanupRef.current = clear
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  const beginScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    scrollRef.current?.focus({ preventScroll: true })
    interactionCleanupRef.current?.()
    const pointerId = event.pointerId
    const seek = (clientX: number) => props.onTimeChange(Math.max(0, Math.min(durationMs,
      contentPoint(clientX, event.clientY).x / pixelsPerMs)))
    seek(event.clientX)
    const move = (e: PointerEvent) => { if (e.pointerId === pointerId) seek(e.clientX) }
    const clear = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      interactionCleanupRef.current = null
    }
    const up = (e: PointerEvent) => { if (e.pointerId === pointerId) clear() }
    interactionCleanupRef.current = clear
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const ticks = useMemo(() => {
    const result: number[] = []
    for (let t = 0; t <= durationMs; t += gridStepMs) result.push(t)
    if (result[result.length - 1] !== durationMs) result.push(durationMs)
    return result
  }, [durationMs, gridStepMs])
  const visibleStartMs = viewport.left / pixelsPerMs
  const visibleEndMs = (viewport.left + Math.max(0, viewport.width - LABEL_WIDTH)) / pixelsPerMs

  return <div className="dope-sheet-grid" ref={scrollRef} tabIndex={0}
    role="region" aria-label="Dope Sheet keyframes">
    <div className="dope-sheet-content" style={{ width: LABEL_WIDTH + timeAreaWidth }}>
      <div className="grid-ruler-row" style={{ height: RULER_HEIGHT }}>
        <div className="ruler-label-spacer" style={{ width: LABEL_WIDTH }}>
          <span>Tracks</span>
          <button type="button" title="Fit timeline · Shift+wheel to zoom" onClick={() => {
            setUserZoom(1)
            if (scrollRef.current) scrollRef.current.scrollLeft = 0
          }}>Fit · {Math.round(userZoom * 100)}%</button>
        </div>
        <div className="time-ruler" style={{ width: timeAreaWidth }} onPointerDown={beginScrub}>
          {ticks.map(time => <span key={time} className="time-mark" style={{ left: time * pixelsPerMs }}>
            {time >= 1000 ? `${+(time / 1000).toFixed(2)}s` : `${Math.round(time)}ms`}
          </span>)}
          <div className="ruler-playhead" style={{ left: props.currentTimeMs * pixelsPerMs }} />
        </div>
      </div>
      <div className="dope-sheet-rows" ref={rowsRef}>
        <div className="dope-sheet-labels" style={{ width: LABEL_WIDTH }}>
          <DopeSheetHierarchy rows={props.rows} selectedLayerId={props.selectedLayerId}
            layout={layout} indices={windowed.indices}
            collapsedNodeIds={props.uiState.collapsedNodeIds} onToggleExpand={props.onToggleExpand}
            onSelectLayer={props.onSelectLayer} />
        </div>
        <div className="dope-sheet-keyrows" style={{ width: timeAreaWidth,
          minHeight: Math.max(0, viewport.height - RULER_HEIGHT) }} onPointerDown={beginMarquee}>
          <WindowedRows layout={layout} indices={windowed.indices} rowKey={index => rowKeys[index]}
            renderRow={(index, attributes) => <DopeSheetKeyframeRow row={props.rows[index]} attributes={attributes}
            selectedKfIds={selectedKfIds} previewMs={drag.previewMs} pixelsPerMs={pixelsPerMs}
            visibleStartMs={visibleStartMs} visibleEndMs={visibleEndMs}
            currentTimeMs={props.currentTimeMs} snapTarget={drag.snapTarget} gridStepMs={gridStepMs}
            onKeyPointerDown={keyPointerDown} onKeySelect={selectKey} onEmptyPointerDown={beginMarquee} />} />
        </div>
      </div>
      {box && <div className="dope-sheet-marquee" style={{
        left: LABEL_WIDTH + Math.min(box.x1, box.x2), top: RULER_HEIGHT + Math.min(box.y1, box.y2),
        width: Math.abs(box.x2 - box.x1), height: Math.abs(box.y2 - box.y1),
      }} />}
    </div>
  </div>
}
