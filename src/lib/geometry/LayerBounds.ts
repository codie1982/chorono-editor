// ── Layer World Bounds for Align / Distribute ───────────────────────────────
// Pure axis-aligned bounding box helpers consumed by the Align/Distribute
// engine. Walks the parent chain so children of nested groups end up in
// absolute (composition) coordinates.
//
// Chorono convention: `layer.transform.x/y` IS the world top-left of the
// layer's visible rect; `transform.anchorX/Y` is a LOCAL pivot for
// rotation/scale and is NOT subtracted from the bbox origin. See
// `src/lib/selection/canvasShapes.ts` for the established pattern this
// mirrors.
//
// MVP scope: ignores rotation, scale, and effects. Aligns to the AABB the
// renderer would draw at the layer's base transform.

import type { ChronoScene, Composition, Layer, LayerType } from '../types'

export interface WorldBounds {
  x: number   // world top-left X
  y: number   // world top-left Y
  w: number
  h: number
}

/** Layer types that don't participate in spatial alignment. */
const NON_SPATIAL: LayerType[] = ['audio']

/**
 * True when a layer can take part in align/distribute operations.
 * Groups and audio are excluded — groups have no intrinsic bounds (they're
 * containers) and audio has no visual presence.
 */
export function isAlignable(layer: Layer): boolean {
  if (NON_SPATIAL.includes(layer.type)) return false
  if (layer.type === 'group') return false
  return true
}

/**
 * Estimate a text layer's rendered width/height when explicit `size` is
 * missing. Heuristic only — proper measurement requires the renderer's
 * font metrics. Good enough for MVP; replace with real measurement when
 * the renderer exposes a measure API.
 */
function estimateTextSize(layer: Layer): { width: number; height: number } {
  const fontSize = layer.text?.fontSize ?? 24
  const charCount = layer.text?.value?.length ?? 0
  const lineHeight = layer.text?.lineHeight ?? 1.2
  return {
    width:  Math.max(charCount * fontSize * 0.6, fontSize),
    height: Math.max(fontSize * lineHeight, fontSize),
  }
}

/**
 * Resolve a layer's size in world units. Falls back to a 1×1 point when
 * nothing is known (path-only layers etc.) so the layer can still
 * participate as a "point" reference.
 */
function getLayerSize(layer: Layer): { width: number; height: number } {
  if (layer.size) return layer.size
  if (layer.type === 'text') return estimateTextSize(layer)
  return { width: 1, height: 1 }
}

/**
 * World-space AABB of a single layer. Accumulates parent group transforms
 * up the tree — children of nested groups end up in absolute composition
 * coordinates.
 *
 * Does NOT account for rotation, scale, or visual effects. MVP scope.
 */
export function getLayerWorldBounds(layer: Layer, scene: ChronoScene): WorldBounds {
  let x = layer.transform.x
  let y = layer.transform.y
  let cur: Layer | undefined = layer
  while (cur?.parentId) {
    const parent = scene.layers.find((p) => p.id === cur!.parentId)
    if (!parent) break
    x += parent.transform.x
    y += parent.transform.y
    cur = parent
  }
  const { width, height } = getLayerSize(layer)
  return { x, y, w: width, h: height }
}

/**
 * Union of world bounds across a list of layers. Used by "Align to
 * Selection" — non-alignable layers (groups, audio) are skipped.
 *
 * Returns null when no alignable layers exist.
 */
export function getSelectionBounds(
  layerIds: string[],
  scene: ChronoScene,
): WorldBounds | null {
  const boxes: WorldBounds[] = []
  for (const id of layerIds) {
    const layer = scene.layers.find((l) => l.id === id)
    if (!layer || !isAlignable(layer)) continue
    boxes.push(getLayerWorldBounds(layer, scene))
  }
  if (boxes.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const b of boxes) {
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Canvas / composition bounds. The composition's coordinate origin is (0,0)
 * by convention; width/height come from the composition record.
 */
export function getCanvasBounds(composition: Composition): WorldBounds {
  return { x: 0, y: 0, w: composition.width, h: composition.height }
}

// ── Bounds-derived helpers ────────────────────────────────────────────────────

export const bbCenterX = (b: WorldBounds): number => b.x + b.w / 2
export const bbCenterY = (b: WorldBounds): number => b.y + b.h / 2
export const bbRight   = (b: WorldBounds): number => b.x + b.w
export const bbBottom  = (b: WorldBounds): number => b.y + b.h
