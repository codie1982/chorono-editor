import { MIN_SCALE } from './scaleMath'
import type { Point } from './rotateMath'

export type SelectionResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'
export interface SelectionResizeBounds { x: number; y: number; width: number; height: number }
export interface SelectionResizeResult { pivot: Point; factorX: number; factorY: number }

/** Numerical extent floor in composition pixels, independent of CSS zoom/DPR.
 * This guards division/collapse; individual geometry minimum sizes stay owned
 * by their respective tools rather than being imposed on a mixed selection. */
export const MIN_SELECTION_RESIZE_EXTENT = 1e-4

/**
 * Prepare a common world-axis scale from a selection bounding-box handle.
 * `bounds` is the immutable evaluated world box at pointer-down; `deltaWorld`
 * is cursor displacement from that same event, in composition pixels. Using a
 * delta preserves the initial grab offset instead of snapping the handle to
 * the cursor. No bounds/source data is mutated and no preview is accumulated.
 *
 * Corners pin the opposite corner; edges pin the opposite edge's midpoint.
 * Proportional corners use the dominant fractional extent change; proportional
 * edges use their active axis and expand the perpendicular axis symmetrically.
 * Positive scale factors are clamped using the shared MIN_SCALE policy and a
 * numerical extent floor, so handles cannot cross through zero. Existing source
 * reflections remain the responsibility of scaleTransformTargets. Applying a
 * nonuniform world scale may require shear; that owner reports unsupported TRS.
 * Returns null for invalid/non-finite bounds, deltas, handles or tiny extents.
 */
export function selectionResize(bounds: Readonly<SelectionResizeBounds>, handle: SelectionResizeHandle,
  deltaWorld: Readonly<Point>, proportional: boolean): SelectionResizeResult | null {
  const { x, y, width, height } = bounds
  if (![x, y, width, height, deltaWorld.x, deltaWorld.y].every(Number.isFinite)
      || width < MIN_SELECTION_RESIZE_EXTENT || height < MIN_SELECTION_RESIZE_EXTENT
      || !Number.isFinite(x + width) || !Number.isFinite(y + height)
      || !['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].includes(handle)) return null
  const west = handle.includes('w'), east = handle.includes('e')
  const north = handle.includes('n'), south = handle.includes('s')
  const rawX = west ? 1 - deltaWorld.x / width : east ? 1 + deltaWorld.x / width : 1
  const rawY = north ? 1 - deltaWorld.y / height : south ? 1 + deltaWorld.y / height : 1
  let factorX = rawX, factorY = rawY
  const minimumX = Math.max(MIN_SCALE, MIN_SELECTION_RESIZE_EXTENT / width)
  const minimumY = Math.max(MIN_SCALE, MIN_SELECTION_RESIZE_EXTENT / height)
  if (proportional) {
    const factor = !(west || east) ? rawY : !(north || south) ? rawX
      : Math.abs(rawX - 1) >= Math.abs(rawY - 1) ? rawX : rawY
    factorX = factorY = Math.max(minimumX, minimumY, factor)
  } else {
    factorX = Math.max(minimumX, factorX)
    factorY = Math.max(minimumY, factorY)
  }
  if (![factorX, factorY, width * factorX, height * factorY].every(Number.isFinite)) return null
  return { pivot: { x: west ? x + width : east ? x : x + width / 2,
    y: north ? y + height : south ? y : y + height / 2 }, factorX, factorY }
}
