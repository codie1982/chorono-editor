import { useEffect, useState, type RefObject } from 'react'
import { canvasPointerWorld } from '../interactions/canvasCoordinates'

/** Observe pointer samples only while enabled. At most one pending animation
 * callback coalesces real pointer events; no callback reschedules itself and
 * idle viewports do no polling. ResizeObserver invalidates CSS chrome geometry.
 * Listeners, queued callbacks and cursor state clear on leave/unmount/scope edit. */
export function useViewportCursor(container: HTMLDivElement, canvasRef: RefObject<HTMLCanvasElement>, enabled: boolean,
  scope: string) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [, resize] = useState(0)
  useEffect(() => {
    setCursor(null)
    if (!enabled) return
    let pending = 0, sample = { x: 0, y: 0 }
    const move = (event: PointerEvent) => {
      sample = { x: event.clientX, y: event.clientY }
      if (!pending) pending = requestAnimationFrame(() => {
        pending = 0
        const canvas = canvasRef.current
        if (canvas) setCursor(canvasPointerWorld(canvas, sample.x, sample.y))
      })
    }
    const leave = () => { cancelAnimationFrame(pending); pending = 0; setCursor(null) }
    const observer = new ResizeObserver(() => resize(value => value + 1))
    observer.observe(container)
    container.addEventListener('pointermove', move, { passive: true })
    container.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(pending); observer.disconnect(); container.removeEventListener('pointermove', move); container.removeEventListener('pointerleave', leave) }
  }, [container, canvasRef, enabled, scope])
  return cursor
}
