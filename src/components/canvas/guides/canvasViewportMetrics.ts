/** Screen-space mapping for ruler/guide chrome. The displayed canvas rectangle
 * is authoritative, including pan, zoom, CSS scaling and browser DPR. The flex
 * centering fallback preserves older ruler callers without a canvas element.
 * All returned dimensions are CSS pixels relative to the viewport container. */
export function canvasViewportMetrics(container: HTMLElement, composition: { width: number; height: number },
  zoom: number, pan: { x: number; y: number }, canvas?: HTMLCanvasElement | null) {
  const viewport = container.getBoundingClientRect(), artboard = canvas?.getBoundingClientRect()
  return { width: viewport.width, height: viewport.height,
    originX: artboard ? artboard.left - viewport.left : viewport.width / 2 - composition.width * zoom / 2 + pan.x,
    originY: artboard ? artboard.top - viewport.top : viewport.height / 2 - composition.height * zoom / 2 + pan.y,
    scaleX: artboard ? artboard.width / composition.width : zoom,
    scaleY: artboard ? artboard.height / composition.height : zoom }
}

export type CanvasViewportMetrics = ReturnType<typeof canvasViewportMetrics>
