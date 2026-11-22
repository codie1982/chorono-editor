export type ViewportFrame = 'fill' | 'square' | 'output'

/** Fit an editor-only viewport into the available CSS box. A fixed frame is
 * letterboxed, never stretched, so picking and camera aspect use its true size. */
export function viewportFrameSize(width: number, height: number, frame: ViewportFrame, outputAspect: number): { width: number; height: number } {
  const availableWidth = Math.max(1, width), availableHeight = Math.max(1, height)
  if (frame === 'fill') return { width: availableWidth, height: availableHeight }
  const aspect = frame === 'square' ? 1 : Number.isFinite(outputAspect) && outputAspect > 0 ? outputAspect : 1
  return availableWidth / availableHeight > aspect
    ? { width: availableHeight * aspect, height: availableHeight }
    : { width: availableWidth, height: availableWidth / aspect }
}
