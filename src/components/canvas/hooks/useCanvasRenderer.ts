import { useEffect, useState, type RefObject } from 'react'
import { createLatestFrameScheduler } from '@/lib/timeline/latestFrameScheduler'
import { drawViewportFrame } from '../render/drawViewportFrame'
import type { CanvasRendererOptions } from '../render/CanvasRendererOptions'
export type { CanvasRendererOptions } from '../render/CanvasRendererOptions'

/**
 * Own one cancellable viewport task. Visual invalidations committed before a
 * browser frame replace the pending snapshot; only the newest is drawn. The
 * timeline, state machine, events and media clocks are evaluated upstream and
 * never throttled here. The last paused/seek state still schedules a draw.
 * Dependency cleanup and unmount cancel pending work, including StrictMode's
 * discarded mount. No result from an obsolete scene may draw after cleanup.
 * Synchronous final render/export bypasses this editor-only scheduler.
 */
export function useCanvasRenderer(canvasRef: RefObject<HTMLCanvasElement>, opts: CanvasRendererOptions): void {
  const {
    scene, timeMs, selectedLayerId, selectedLayerIds, assets, viewportRef, viewportKey, viewportScale,
    snapEnabled, snapToGridOn, gridSize, overrides, paramValues, dragOverrides,
    ghostSettings, selectedTimeline, hideEditorUI,
  } = opts

  const [layoutRevision, setLayoutRevision] = useState(0)
  // Resize and CSS transition completion invalidate clipping even while paused.
  // During transitions the full backing canvas is preserved, avoiding popping
  // between animation frames without introducing a second animation loop.
  useEffect(() => {
    const viewport = viewportRef?.current, canvas = canvasRef.current
    if (!viewport || !canvas) return
    const invalidate = () => setLayoutRevision(value => value + 1)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate)
    observer?.observe(viewport); observer?.observe(canvas)
    viewport.addEventListener('transitionend', invalidate)
    viewport.addEventListener('transitioncancel', invalidate)
    return () => {
      observer?.disconnect()
      viewport.removeEventListener('transitionend', invalidate)
      viewport.removeEventListener('transitioncancel', invalidate)
    }
  }, [canvasRef, viewportRef])

  useEffect(() => {
    const task = createLatestFrameScheduler(() => {
      const canvas = canvasRef.current
      if (canvas) drawViewportFrame(canvas, opts)
    })
    task.push(undefined)
    return () => task.cancel()
    // opts is a call-site record; scalar/reference visual inputs are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, timeMs, selectedLayerId, selectedLayerIds, assets, snapEnabled, snapToGridOn, gridSize, overrides, paramValues, dragOverrides, ghostSettings, selectedTimeline, hideEditorUI, viewportKey, layoutRevision, viewportRef, viewportScale, canvasRef])
}
