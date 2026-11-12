const RULER_THICKNESS = 18
const INTERACTIVE = 'button,input,select,textarea,a,[role="button"],[role="dialog"],[role="menu"],[role="toolbar"],[contenteditable="true"]'

/** Whether a client-space CSS-pixel point belongs to the bare viewport work area.
 * The work area includes editable space outside the composition, but excludes
 * rulers, foreign panels and explicitly marked chrome rectangles. Actual hit
 * testing is used rather than the pointer event target because capture can keep
 * targeting the canvas while the physical pointer is over a control. Guide-line
 * buttons remain work surfaces; their persisted positions are not changed here.
 *
 * This query never mutates source/DOM. It performs one hit test and bounded-by-
 * chrome-count rectangle checks. Missing/disconnected/degenerate geometry or
 * a point hidden by another surface is rejected. The event target is a fallback
 * only for hosts without elementFromPoint, such as lightweight adapter tests.
 */
export function isViewportCursorPoint(container: HTMLDivElement, clientX: number, clientY: number,
  eventTarget: EventTarget | null = null): boolean {
  if (container.isConnected === false || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false
  const rect = container.getBoundingClientRect()
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= RULER_THICKNESS || rect.height <= RULER_THICKNESS) return false
  if (clientX < rect.left + RULER_THICKNESS || clientY < rect.top + RULER_THICKNESS ||
    clientX >= rect.left + rect.width || clientY >= rect.top + rect.height) return false
  for (const region of Array.from(container.querySelectorAll<HTMLElement>('[data-viewport-cursor-block]'))) {
    const blocked = region.getBoundingClientRect()
    if (clientX >= blocked.left && clientY >= blocked.top &&
      clientX < blocked.left + blocked.width && clientY < blocked.top + blocked.height) return false
  }
  const document = container.ownerDocument
  const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(clientX, clientY) : eventTarget
  if (!hit || !container.contains(hit as Node) || typeof (hit as Element).closest !== 'function') return false
  const control = (hit as Element).closest(INTERACTIVE)
  return !control || control.hasAttribute('data-guide-id')
}
