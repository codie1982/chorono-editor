// ── Layer transform helpers ────────────────────────────────────────────────
// Pure mutators used by the canvas right-click menu (Rotate 90°, Flip H/V).
// They return a *new* Layer with the transform updated — the caller wraps
// the result in `makeUpdateLayerCmd` so undo/redo come for free.
//
// Anchor-aware: rotation is added to `rotationDeg` (visually rotates around
// the pivot the user can see). Flip is a sign change on scaleX/Y — which is
// what every other tool does, so muscle memory carries over.

import type { Layer } from '../types'

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

/** Set anchor to the visual centre of the layer's bounding box.
 *  For shapes/images/videos uses `size`; for text estimates from
 *  fontSize × char count (matches the same heuristic used in defaults.ts). */
export function centerOrigin(layer: Layer): Layer {
  const { w, h } = guessLayerSize(layer)
  return withTransform(layer, (t) => ({ ...t, anchorX: w / 2, anchorY: h / 2 }))
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

function guessLayerSize(layer: Layer): { w: number; h: number } {
  if (layer.size) return { w: layer.size.width, h: layer.size.height }
  if (layer.text) {
    const fs = layer.text.fontSize ?? 24
    const len = layer.text.value?.length ?? 4
    return { w: Math.max(1, len * fs * 0.55), h: fs }
  }
  return { w: 80, h: 80 }
}
