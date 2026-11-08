'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Timeline, TimelineSettings } from '@/lib/types'
import type { KfMove } from '@/lib/editor/commands-keyframe'
import { createDopeSheetDrag, type DopeSheetDragUpdate } from '@/lib/dope-sheet/key-drag'
export type { DragSnapshot } from '@/lib/dope-sheet/key-drag'

interface Props {
  timeline: Timeline
  settings: TimelineSettings
  frameRate: number
  pixelsPerMs: number
  gridStepMs: number
  enabled: boolean
  onDragStart: () => void
  onDragMove: (update: DopeSheetDragUpdate) => void
  onDragEnd: (moves: KfMove[]) => void
  onCancel: () => void
}

/** Window listeners are torn down on release, Escape, pointercancel and unmount. */
export function useDopeSheetKeyDrag(props: Props) {
  const latest = useRef(props)
  latest.current = props
  const cleanupRef = useRef<((updateState?: boolean) => void) | null>(null)
  const [previewMs, setPreviewMs] = useState<Record<string, number>>({})
  const [snapTarget, setSnapTarget] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const beginDrag = useCallback((
    event: React.PointerEvent<HTMLElement>, kfId: string, selectedIds: Set<string>, onClick?: () => void,
  ) => {
    if (event.button !== 0 || !latest.current.enabled) return
    cleanupRef.current?.()
    event.preventDefault()
    event.stopPropagation()
    const current = latest.current
    const session = createDopeSheetDrag({
      timeline: current.timeline, settings: current.settings, frameRate: current.frameRate,
      pixelsPerMs: current.pixelsPerMs, gridStepMs: current.gridStepMs,
      startX: event.clientX, leaderId: kfId, selectedIds,
      onBegin: current.onDragStart,
      onPreview: update => {
        setPreviewMs(update.previewMs)
        setSnapTarget(update.snappedTo)
        current.onDragMove(update)
      },
      onCommit: current.onDragEnd, onCancel: current.onCancel, onClick,
    })
    if (!session) return
    setIsDragging(true)
    const pointerId = event.pointerId
    const target = event.currentTarget
    try { target.setPointerCapture(pointerId) } catch { /* optional in embedded browsers */ }
    const clear = (updateState = true) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      try { target.releasePointerCapture(pointerId) } catch { /* already released */ }
      session.cancel()
      cleanupRef.current = null
      if (updateState) { setIsDragging(false); setPreviewMs({}); setSnapTarget(null) }
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId === pointerId) session.move(e.clientX, e.ctrlKey || e.metaKey)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      session.finish(e.clientX, e.ctrlKey || e.metaKey)
      clear()
    }
    const cancel = (e: PointerEvent) => { if (e.pointerId === pointerId) clear() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clear() }
    }
    cleanupRef.current = clear
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }, [])

  useEffect(() => {
    if (!props.enabled) cleanupRef.current?.()
  }, [props.enabled])
  useEffect(() => {
    setIsDragging(false); setPreviewMs({}); setSnapTarget(null)
    return () => cleanupRef.current?.(false)
  }, [props.timeline.id])

  return { beginDrag, previewMs, snapTarget, isDragging }
}
