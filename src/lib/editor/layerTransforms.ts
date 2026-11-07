// ── Layer transform helpers ────────────────────────────────────────────────
// Pure mutators used by the canvas right-click menu (Rotate 90°, Flip H/V).
// They return a *new* Layer with the transform updated — the caller wraps
// the result in `makeUpdateLayerCmd` so undo/redo come for free.
//
// Anchor-aware: rotation is added to `rotationDeg` (visually rotates around
// the pivot the user can see). Flip is a sign change on scaleX/Y — which is
// what every other tool does, so muscle memory carries over.

import type { Layer } from '../types'
import { reanchorTransform } from '../canvas/math/anchorMath'
import { computeSplineBounds } from '../spline/geometry/computeSplineBounds'
import { computePathBounds } from '../geometry/computePathBounds'
import { bezierPathToPathDefinition } from '../path/bezierToPathDefinition'
import { measureTextLayout } from '../text/measureText'

/** Rotate 90° clockwise (positive direction in screen coordinates). */
export function rotate90CW(layer: Layer): Layer {
  return withTransform(layer, (t) => ({
    ...t,
    rotationDeg: normalizeAngle(t.rotationDeg + 90),
  }))
}

/** Rotate 90° counter-clockwise. */
export function rotate90CCW(layer: Layer): Layer {
  return withTransform(layer, (t) => ({
    ...t,
    rotationDeg: normalizeAngle(t.rotationDeg - 90),
  }))
}

/** Mirror horizontally — flips scaleX sign, keeps everything else. */
export function flipHorizontal(layer: Layer): Layer {
  return withTransform(layer, (t) => ({ ...t, scaleX: -t.scaleX }))
}

/** Mirror vertically — flips scaleY sign. */
export function flipVertical(layer: Layer): Layer {
  return withTransform(layer, (t) => ({ ...t, scaleY: -t.scaleY }))
}

/** Centre the pivot on actual local geometry without moving the artwork.
 *  Unsupported/empty content keeps its existing pivot rather than guessing a
 *  box. Editing points never calls this automatically: user pivots persist. */
export function centerOrigin(layer: Layer): Layer {
  const center = layerGeometryCenter(layer)
  if (!center) return layer
  return withTransform(layer, (transform) => reanchorTransform(transform, center.x, center.y))
}

// ── Internal ────────────────────────────────────────────────────────────────

function withTransform(layer: Layer, fn: (t: Layer['transform']) => Layer['transform']): Layer {
  return { ...layer, transform: fn(layer.transform) }
}

function normalizeAngle(deg: number): number {
  // Keep values in (-360, 360) so the inspector stays readable.
  let d = deg % 360
  if (d > 180)  d -= 360
  if (d < -180) d += 360
  return d
}

function layerGeometryCenter(layer: Layer): { x: number; y: number } | null {
  // Path geometry stays canonical even when a converted layer retains size.
  if (layer.type === 'spline') {
    if (!layer.spline || !Object.values(layer.spline.contours).some(contour => contour.pointIds.length > 0)) return null
    const bounds = computeSplineBounds(layer.spline)
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  }
  if (layer.type === 'path') {
    if (!layer.path?.anchors.length) return null
    const bounds = computePathBounds(bezierPathToPathDefinition(layer.path))
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  }
  if (layer.size) return { x: layer.size.width / 2, y: layer.size.height / 2 }
  if (layer.text) {
    const measured = measureTextLayout(layer.text)
    return { x: measured.width / 2, y: measured.height / 2 }
  }
  return null
}
