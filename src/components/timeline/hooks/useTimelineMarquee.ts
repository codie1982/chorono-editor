'use client'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface TimelineSelectionBox { x: number; y: number; w: number; h: number }
interface Gesture {
  pointerId: number; x: number; y: number; clientX: number; clientY: number
  additive: boolean; baseline: ReadonlySet<string>; moved: boolean
}

/** Pointer owner for rectangular key selection in the Timeline body. Plain drag
 * replaces selection; Shift/Cmd/Ctrl adds, and legacy Alt-drag also works.
 * Labels and native/key controls keep their existing gestures. CSS coordinates
 * include vertical scroll; hit testing delegates to the production row model,
 * so unmounted virtual rows and dense glyphs do not need DOM key elements.
 *
 * The release coordinates are authoritative, even without a final move event.
 * A completed drag consumes its trailing click. Escape, cancellation, capture
 * loss, blur, context replacement and unmount discard the preview without
 * selecting keys or touching scene/history. Owns one pointer capture and only
 * active-gesture window listeners; no polling or animation loop is installed.
 */
export function useTimelineMarquee(options: {
  container: RefObject<HTMLDivElement>; labelWidth: number; selectedIds: ReadonlySet<string>
  onSelect: (ids: Set<string>) => void; hitTest: (box: TimelineSelectionBox) => ReadonlySet<string>
  context: unknown; scope?: ReadonlySet<string> | null
}) {
  const latest = useRef(options); latest.current = options
  const gesture = useRef<Gesture | null>(null), swallowClick = useRef(false)
  const [box, setBox] = useState<TimelineSelectionBox | null>(null), [active, setActive] = useState(false)
  /** Convert a client point to the same scroll-content coordinates as row layout. */
  const rectangle = (current: Gesture, clientX: number, clientY: number) => {
    const element = latest.current.container.current!, bounds = element.getBoundingClientRect()
    const x = clientX - bounds.left + element.scrollLeft, y = clientY - bounds.top + element.scrollTop
    return { x: Math.min(current.x, x), y: Math.min(current.y, y), w: Math.abs(current.x - x), h: Math.abs(current.y - y) }
  }
  const finish = useCallback(() => {
    const current = gesture.current; gesture.current = null
    setBox(null); setActive(false)
    if (current) {
      const element = latest.current.container.current
      try { if (element?.hasPointerCapture(current.pointerId)) element.releasePointerCapture(current.pointerId) } catch { /* Detached/cancelled native pointer. */ }
    }
  }, [])
  const cancel = useCallback(() => { if (gesture.current) swallowClick.current = true; finish() }, [finish])
  useEffect(() => { cancel() }, [options.context, options.scope, cancel])
  useEffect(() => {
    if (!active) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() }
    }
    window.addEventListener('keydown', key, true); window.addEventListener('blur', cancel)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', cancel) }
  }, [active, cancel])
  useEffect(() => () => {
    const current = gesture.current; gesture.current = null
    const element = latest.current.container.current
    try { if (current && element?.hasPointerCapture(current.pointerId)) element.releasePointerCapture(current.pointerId) } catch { /* Detached native pointer. */ }
  }, [])
  return { box, bindings: {
    onPointerDownCapture: () => { if (!gesture.current) swallowClick.current = false },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || gesture.current) return
      const element = options.container.current, target = event.target as Element
      if (!element || target.closest('[data-kf-id],button,input,select,textarea,a,[role="button"],[data-timeline-gesture]')) return
      const bounds = element.getBoundingClientRect(), x = event.clientX - bounds.left + element.scrollLeft
      if (x < options.labelWidth) return
      event.preventDefault(); swallowClick.current = false
      gesture.current = { pointerId: event.pointerId, x, y: event.clientY - bounds.top + element.scrollTop,
        clientX: event.clientX, clientY: event.clientY, additive: event.shiftKey || event.ctrlKey || event.metaKey,
        baseline: new Set(options.selectedIds), moved: false }
      setActive(true)
      try { element.setPointerCapture(event.pointerId) } catch { /* Synthetic acceptance pointers have no native capture. */ }
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const current = gesture.current
      if (!current || event.pointerId !== current.pointerId) return
      current.clientX = event.clientX; current.clientY = event.clientY
      const next = rectangle(current, event.clientX, event.clientY)
      current.moved ||= Math.hypot(next.w, next.h) >= 3
      if (current.moved) setBox(next)
    },
    onScroll: () => { const current = gesture.current; if (current?.moved) setBox(rectangle(current, current.clientX, current.clientY)) },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      const current = gesture.current
      if (!current || event.pointerId !== current.pointerId) return
      const finalBox = rectangle(current, event.clientX, event.clientY)
      if (current.moved || Math.hypot(finalBox.w, finalBox.h) >= 3) {
        const next = new Set(current.additive ? current.baseline : [])
        latest.current.hitTest(finalBox).forEach(id => next.add(id))
        swallowClick.current = true; latest.current.onSelect(next)
      }
      finish()
    },
    onPointerCancel: cancel,
    onLostPointerCapture: (event: React.PointerEvent<HTMLDivElement>) => { if (gesture.current?.pointerId === event.pointerId) cancel() },
    onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => {
      if (swallowClick.current) { swallowClick.current = false; event.preventDefault(); event.stopPropagation() }
    },
  } }
}
