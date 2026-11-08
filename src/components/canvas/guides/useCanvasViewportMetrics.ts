import { useLayoutEffect, useState } from 'react'
import { canvasViewportMetrics } from './canvasViewportMetrics'

/** Read the committed canvas rectangle before paint, rather than retaining a
 * pre-commit render rectangle after zoom/pan changes. Both canvas and container
 * resize events invalidate the mapping even when rulers/cursor are hidden.
 * Identical samples preserve state; there is no timer or idle render loop. */
export function useCanvasViewportMetrics(container: HTMLDivElement, canvas: HTMLCanvasElement | null,
  composition: { width: number; height: number }, zoom: number, pan: { x: number; y: number }) {
  const [frame, setFrame] = useState(() => canvasViewportMetrics(container, composition, zoom, pan, canvas))
  useLayoutEffect(() => {
    const sync = () => {
      const next = canvasViewportMetrics(container, composition, zoom, pan, canvas)
      setFrame(previous => Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof previous]) ? previous : next)
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(container)
    if (canvas) observer.observe(canvas)
    return () => observer.disconnect()
  }, [container, canvas, composition.width, composition.height, zoom, pan.x, pan.y])
  return frame
}
