import { flushSync } from 'react-dom'

/** Native viewport regression for the private centered-mesh fixture. Inspect
 * the marker while a frame-resize gesture is still active: after release even
 * the broken implementation restores the origin and would give a false pass.
 * Uses CSS viewport pixels, commits one resize, and always releases the pointer. */
export async function checkLiveMeshCenter(): Promise<string> {
  const frame = document.querySelector<HTMLElement>('[data-testid="selection-frame"]')
  const handle = frame?.querySelector<HTMLElement>('[data-handle="se"]')
  const origin = document.querySelector<HTMLElement>('[data-transform-marker="origin"]')
  if (!frame || !handle || !origin) throw new Error('Select the centered mesh in Select mode, outside Edit mode.')
  const center = (element: HTMLElement) => {
    const bounds = element.getBoundingClientRect()
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  }
  const separation = () => Math.hypot(center(frame).x - center(origin).x, center(frame).y - center(origin).y)
  if (separation() > 0.25) throw new Error('This check requires the private fixture with a centered origin.')
  const start = center(handle), before = center(origin), end = { x: start.x + 48, y: start.y + 32 }
  const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const pointer = (target: EventTarget, type: string, point: { x: number; y: number }) => flushSync(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 91,
      pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y }))
  })
  pointer(handle, 'pointerdown', start)
  try {
    pointer(window, 'pointermove', end); await frames()
    const distance = separation(), moved = Math.hypot(center(origin).x - before.x, center(origin).y - before.y)
    if (moved < 5) throw new Error('The live origin did not move during resize.')
    if (distance > 0.25) throw new Error(`Live origin missed the mesh center by ${distance.toFixed(2)} CSS px.`)
    return `PASS · origin moved ${moved.toFixed(2)} px; live center error ${distance.toFixed(3)} px before pointer-up`
  } finally { pointer(window, 'pointerup', end); await frames() }
}
