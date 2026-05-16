'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Params {
  storageKey: string
  /** Initial size in px (height for vertical axis, width for horizontal). */
  defaultHeight: number
  minHeight: number
  maxHeight: number
  /**
   * Direction in which dragging the handle grows the panel.
   *   'up'   — handle on TOP edge, panel grows by dragging up (timeline)
   *   'down' — handle on BOTTOM edge, panel grows downward
   *   'left' — handle on LEFT edge, panel grows by dragging left (right sidebar)
   *   'right' — handle on RIGHT edge, panel grows by dragging right (left sidebar)
   */
  direction?: 'up' | 'down' | 'left' | 'right'
}

interface ResizableReturn {
  height: number
  setHeight: (h: number) => void
  onDragHandlePointerDown: (e: React.PointerEvent<HTMLElement>) => void
  isResizing: boolean
}

/**
 * Generic resizable-panel hook with localStorage persistence. Works for both
 * vertical (timeline-style) and horizontal (sidebar-style) panels via the
 * `direction` parameter — `up/down` resize height, `left/right` resize width.
 */
export function useResizablePanel({
  storageKey, defaultHeight, minHeight, maxHeight, direction = 'up',
}: Params): ResizableReturn {
  const [height, setHeightState] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultHeight
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? Number(raw) : NaN
    if (!Number.isFinite(parsed)) return defaultHeight
    return Math.max(minHeight, Math.min(maxHeight, parsed))
  })

  const [isResizing, setIsResizing] = useState(false)
  const dragRef = useRef<{ startCoord: number; startHeight: number } | null>(null)
  const horizontal = direction === 'left' || direction === 'right'

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(height))
  }, [storageKey, height])

  const setHeight = useCallback((h: number) => {
    setHeightState(Math.max(minHeight, Math.min(maxHeight, h)))
  }, [minHeight, maxHeight])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return
    const coord = horizontal ? e.clientX : e.clientY
    const delta = coord - dragRef.current.startCoord
    // 'up' or 'left' = drag toward 0 grows the panel → invert delta
    const growsByNegative = direction === 'up' || direction === 'left'
    const next = growsByNegative
      ? dragRef.current.startHeight - delta
      : dragRef.current.startHeight + delta
    setHeight(next)
  }, [setHeight, direction, horizontal])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    setIsResizing(false)
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup',   handlePointerUp)
    const target = e.target as HTMLElement
    try { target.releasePointerCapture(e.pointerId) } catch { /* already released */ }
  }, [handlePointerMove])

  const onDragHandlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = {
      startCoord: horizontal ? e.clientX : e.clientY,
      startHeight: height,
    }
    setIsResizing(true)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [height, horizontal, handlePointerMove, handlePointerUp])

  return { height, setHeight, onDragHandlePointerDown, isResizing }
}
