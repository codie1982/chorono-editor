/**
 * Resize-handle drag math (modifies layer.size + repositions). Pure,
 * framework-free.
 */

import { clamp } from './coordinateMath'

/** 8-point resize-handle identifiers. Structurally identical to the
 *  component-side `Handle` union, kept here so this module owns no UI deps. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

export interface ResizeInput {
  /** Layer transform origin at drag start. */
  x: number
  y: number
  /** Layer size at drag start. */
  width: number
  height: number
  /** Layer anchor offset at drag start (kept proportional across the resize). */
  anchorX: number
  anchorY: number
  handle: ResizeHandle
  /** Pointer delta in composition px. */
  dx: number
  dy: number
  /** Cmd/Ctrl → aspect-lock. */
  proportional: boolean
  /** Snap result to integer px. */
  snapPixel: boolean
  /** Smallest allowed dimension. */
  minSize: number
  /** Composition bounds the layer is clamped within. */
  boundsWidth: number
  boundsHeight: number
}

export interface ResizeResult {
  x: number
  y: number
  width: number
  height: number
  anchorX: number
  anchorY: number
}

export function calculateResize(input: ResizeInput): ResizeResult {
  const {
    x: ox, y: oy, width: ow, height: oh,
    anchorX: oax, anchorY: oay,
    handle: h, dx, dy, proportional, snapPixel, minSize,
    boundsWidth: cw, boundsHeight: ch,
  } = input

  let nx = ox, ny = oy, nw = ow, nh = oh
  // Per-handle raw deltas
  if (h === 'e' || h === 'ne' || h === 'se') nw = ow + dx
  if (h === 'w' || h === 'nw' || h === 'sw') { nw = ow - dx; nx = ox + dx }
  if (h === 's' || h === 'sw' || h === 'se') nh = oh + dy
  if (h === 'n' || h === 'nw' || h === 'ne') { nh = oh - dy; ny = oy + dy }

  // Aspect-lock when Cmd/Ctrl held — use the dominant fractional change
  if (proportional && ow > 0 && oh > 0) {
    const aspect = ow / oh
    const wRatio = nw / ow
    const hRatio = nh / oh
    const useWidth = Math.abs(wRatio - 1) >= Math.abs(hRatio - 1)
    if (useWidth) nh = Math.max(minSize, nw / aspect)
    else          nw = Math.max(minSize, nh * aspect)
    // Re-anchor x/y on handles that pull from top/left
    if (h === 'nw' || h === 'sw' || h === 'w') nx = ox + (ow - nw)
    if (h === 'nw' || h === 'ne' || h === 'n') ny = oy + (oh - nh)
  }

  // Minimum size + composition-bounds clamp
  nw = Math.max(minSize, nw)
  nh = Math.max(minSize, nh)

  // Snap to Pixel during resize → integer position + integer dim. Grid/Object
  // snap is intentionally NOT applied to resize (a moving edge has no canonical
  // rect to snap against and per-axis grid-snap produces jarring jumps).
  if (snapPixel) {
    nx = Math.round(nx); ny = Math.round(ny)
    nw = Math.round(nw); nh = Math.round(nh)
  }

  nx = clamp(nx, 0, Math.max(0, cw - nw))
  ny = clamp(ny, 0, Math.max(0, ch - nh))
  nw = Math.min(nw, cw - nx)
  nh = Math.min(nh, ch - ny)

  // Preserve the anchor's PROPORTIONAL position across the resize, so a centred
  // anchor (50%) stays centred instead of sticking to its original px offset.
  const fx = ow > 0 ? oax / ow : 0.5
  const fy = oh > 0 ? oay / oh : 0.5

  return {
    x: nx,
    y: ny,
    width: nw,
    height: nh,
    anchorX: fx * nw,
    anchorY: fy * nh,
  }
}
