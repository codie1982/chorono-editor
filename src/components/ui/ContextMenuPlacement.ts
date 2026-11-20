/** Viewport-space CSS pixel measurements for one menu. parentLeft is the
 * parent row's left edge for submenus; omit it for root context menus. */
export interface ContextMenuMeasurements {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly parentLeft?: number
}

/** Place a measured menu within a four-pixel viewport margin. A submenu that
 * cannot fit to the right opens left of its parent with four pixels of overlap,
 * preserving the pointer transit corridor instead of covering the parent row.
 * Oversized menus start at the margin; scrolling/size constraints remain the
 * caller's responsibility. Inputs must be finite DOM measurements with
 * nonnegative sizes. This deterministic calculation does not mutate inputs. */
export function placeContextMenu(input: ContextMenuMeasurements): { left: number; top: number } {
  const { x, y, width, height, viewportWidth, viewportHeight, parentLeft } = input
  const left = x + width > viewportWidth - 4 && parentLeft !== undefined ? parentLeft - width + 4 : x
  return {
    left: Math.max(4, Math.min(left, viewportWidth - width - 4)),
    top: Math.max(4, Math.min(y, viewportHeight - height - 4)),
  }
}
