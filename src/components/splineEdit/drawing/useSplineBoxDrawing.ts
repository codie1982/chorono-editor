import { useEffect, useRef } from 'react'
import { PointerGestureSession, type PointerGestureSample } from '@/components/canvas/interactions/PointerGestureSession'

/** Borrowed native pointer owner for box primitives. Capture failure falls back
 * to window capture listeners; final up is sampled once. Cancellation/unmount
 * never commits. Callback refs avoid restarting the gesture on React renders. */
export function useSplineBoxDrawing(options: { enabled: boolean; element(): Element | null;
  move(sample: PointerGestureSample): void; up(sample: PointerGestureSample): void; cancel(): void }) {
  const latest = useRef(options); latest.current = options
  const owner = useRef<PointerGestureSession | null>(null)
  useEffect(() => { if (!options.enabled) { owner.current?.cancel('escape'); owner.current = null } }, [options.enabled])
  useEffect(() => () => { owner.current?.dispose(); owner.current = null }, [])
  return {
    start(pointerId: number) {
      const element = latest.current.element()
      if (!element) return
      owner.current?.cancel('escape')
      owner.current = new PointerGestureSession({ eventTarget: window,
        move: sample => latest.current.move(sample),
        up: sample => { owner.current = null; latest.current.up(sample) },
        cancel: () => { owner.current = null; latest.current.cancel() },
      }, { pointerId, currentTarget: element, button: 0, pointerType: 'mouse' })
    },
    cancel() { owner.current?.cancel('escape'); owner.current = null },
  }
}
