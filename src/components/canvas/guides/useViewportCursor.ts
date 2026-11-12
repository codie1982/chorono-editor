import { useEffect, useState, type RefObject } from 'react'
import { canvasPointerWorld } from '../interactions/canvasCoordinates'
import { isViewportCursorPoint } from './viewportCursorPoint'

/** Observe pointer samples only while enabled. At most one pending animation
 * callback coalesces real pointer events; no callback reschedules itself and
 * idle viewports do no polling. ResizeObserver invalidates CSS chrome geometry.
 * The physical hit point must stay in the bare work area, including when native
 * capture retargets events to canvas. Controls, ruler chrome, foreign panels,
 * blur and hidden documents clear queued samples immediately. Listeners,
 * callbacks and cursor state clear on leave/unmount/scope edit. */
export function useViewportCursor(container: HTMLDivElement, canvasRef: RefObject<HTMLCanvasElement>, enabled: boolean,
  scope: string) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [, resize] = useState(0)
  useEffect(() => {
    setCursor(null)
    if (!enabled) return
    let pending = 0, sample: { x: number; y: number; target: EventTarget | null } = { x: 0, y: 0, target: null }
    const leave = () => { cancelAnimationFrame(pending); pending = 0; setCursor(null) }
    const move = (event: PointerEvent) => {
      if (!isViewportCursorPoint(container, event.clientX, event.clientY, event.target)) { leave(); return }
      sample = { x: event.clientX, y: event.clientY, target: event.target }
      if (!pending) pending = requestAnimationFrame(() => {
        pending = 0
        const canvas = canvasRef.current
        if (canvas && isViewportCursorPoint(container, sample.x, sample.y, sample.target)) setCursor(canvasPointerWorld(canvas, sample.x, sample.y))
        else setCursor(null)
      })
    }
    const visibility = () => { if (container.ownerDocument.hidden) leave() }
    const window = container.ownerDocument.defaultView
    const observer = new ResizeObserver(() => { leave(); resize(value => value + 1) })
    observer.observe(container)
    container.addEventListener('pointermove', move, { passive: true, capture: true })
    container.addEventListener('pointerleave', leave)
    container.addEventListener('pointercancel', leave)
    container.ownerDocument.addEventListener('visibilitychange', visibility)
    container.ownerDocument.addEventListener('scroll', leave, true)
    window?.addEventListener('blur', leave)
    window?.addEventListener('resize', leave)
    return () => {
      cancelAnimationFrame(pending); observer.disconnect()
      container.removeEventListener('pointermove', move, true); container.removeEventListener('pointerleave', leave)
      container.removeEventListener('pointercancel', leave)
      container.ownerDocument.removeEventListener('visibilitychange', visibility)
      container.ownerDocument.removeEventListener('scroll', leave, true)
      window?.removeEventListener('blur', leave); window?.removeEventListener('resize', leave)
    }
  }, [container, canvasRef, enabled, scope])
  return cursor
}
