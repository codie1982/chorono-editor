/** Convert a client pointer to composition pixels on the current native canvas.
 * The rect already contains pan/zoom/layout. Canvas backing dimensions own the
 * composition mapping; DPR is never multiplied again. Throws when no visible
 * editing area exists. Returns a new point, without reading/changing source. */
export function canvasPointerWorld(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) throw new Error('The canvas has no visible editing area.')
  return { x: (clientX - rect.left) * canvas.width / rect.width, y: (clientY - rect.top) * canvas.height / rect.height }
}
