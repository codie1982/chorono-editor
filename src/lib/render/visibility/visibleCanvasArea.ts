import type { PathBounds } from '@/lib/geometry/computePathBounds'

interface Rectangle { left: number; top: number; width: number; height: number }

/** Converts the intersection of a CSS canvas rectangle and its clipping viewport
 * to backing pixels. Pan/zoom are already reflected by DOM rectangles. Invalid
 * layout returns unknown (draw all); an empty intersection is a valid zero area.
 * Axis-aligned CSS scaling/translation only; the editor uses this exact contract. */
export function visibleCanvasArea(canvas: Rectangle, clip: Rectangle, width: number, height: number): PathBounds | undefined {
  if (![canvas.left, canvas.top, canvas.width, canvas.height, clip.left, clip.top, clip.width, clip.height, width, height]
    .every(Number.isFinite) || canvas.width <= 0 || canvas.height <= 0 || width <= 0 || height <= 0
    || clip.width < 0 || clip.height < 0) return undefined
  const left = Math.max(canvas.left, clip.left), top = Math.max(canvas.top, clip.top)
  return { x: (left - canvas.left) * width / canvas.width,
    y: (top - canvas.top) * height / canvas.height,
    width: Math.max(0, Math.min(canvas.left + canvas.width, clip.left + clip.width) - left) * width / canvas.width,
    height: Math.max(0, Math.min(canvas.top + canvas.height, clip.top + clip.height) - top) * height / canvas.height }
}
