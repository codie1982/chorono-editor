import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { canvasPointerWorld } from '@/components/canvas/interactions/canvasCoordinates'
import { applyAxisLock } from '@/lib/canvas/math/moveMath'
import type { ArrayAuthoringController } from './useArrayAuthoring'
import { arraySettingsFromHandle, type ArrayHandlePoint } from './arrayHandleGeometry'

/** Draft-only pointer adapter. Unlike EditorPointerSession, this tool does NOT
 * begin/preview an editor source transaction: it changes only bounded Array
 * form settings. Native capture/window listeners are borrowed for one drag and
 * removed on release, cancel, blur, lost capture, stale scope or unmount.
 * Every sample uses the original settings/frame, avoiding accumulated deltas.
 */
export function useArrayHandles(authoring: ArrayAuthoringController, canvasRef: RefObject<HTMLCanvasElement>) {
  const active = useRef<{ cancel: () => void } | null>(null)
  const latest = useRef(authoring); latest.current = authoring
  const [warning, setWarning] = useState('')
  useEffect(() => () => { active.current?.cancel() }, [authoring.active, authoring.stale])
  const begin = useCallback((event: React.PointerEvent<SVGGElement>, handle: ArrayHandlePoint) => {
    const canvas = canvasRef.current, base = latest.current
    if (event.button !== 0 || !canvas || !base.plan || active.current) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus()
    const pointerId = event.pointerId, reference = base.plan.reference, settings = base.settings
    const start = canvasPointerWorld(canvas, event.clientX, event.clientY)
    let closed = false
    const clear = () => {
      if (closed) return; closed = true
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancelEvent); window.removeEventListener('blur', cancel)
      canvas.removeEventListener('lostpointercapture', cancelEvent)
      try { canvas.releasePointerCapture(pointerId) } catch { /* browser already released capture */ }
      active.current = null
    }
    const cancel = () => { if (closed) return; clear(); latest.current.setSettings(settings) }
    const cancelEvent = (event: Event) => { if (!(event instanceof PointerEvent) || event.pointerId === pointerId) cancel() }
    const sample = (event: PointerEvent) => {
      if (closed || event.pointerId !== pointerId) return
      try {
        if (!latest.current.active || latest.current.stale) { clear(); return }
        const point = canvasPointerWorld(canvas, event.clientX, event.clientY)
        const delta = applyAxisLock(point.x - start.x, point.y - start.y, null, event.shiftKey)
        latest.current.setSettings(arraySettingsFromHandle(settings, reference, handle.kind,
          { x: handle.world.x + delta.dx, y: handle.world.y + delta.dy }))
      } catch (error) { cancel(); setWarning(error instanceof Error ? error.message : String(error)) }
    }
    const move = (event: PointerEvent) => sample(event)
    const up = (event: PointerEvent) => { if (event.pointerId === pointerId) { sample(event); clear() } }
    active.current = { cancel }; setWarning('')
    try { canvas.setPointerCapture(pointerId) } catch { /* dispatched pointer fixtures still use window listeners */ }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancelEvent); window.addEventListener('blur', cancel)
    canvas.addEventListener('lostpointercapture', cancelEvent)
  }, [canvasRef])
  return { begin, warning }
}
