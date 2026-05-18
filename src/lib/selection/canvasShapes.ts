// ── Canvas Selection Shape Hit-Test (BL-60 Faz 3) ─────────────────────────────
// Pure helpers used by the canvas Box / Lasso / Circle / Paint selection
// tools. Each function tests whether a single layer's anchor point falls
// inside the shape — the simplest hit model that matches Figma/Photoshop's
// "click and drag to gather everything in the region" behavior.

import type { ChronoScene, Layer } from '../types'

interface Vec2 { x: number; y: number }

// ─────────────────────────────────────────────────────────────────────────────
// Layer anchor → canvas-world position
// ─────────────────────────────────────────────────────────────────────────────

/** World position of a layer's anchor point — what we hit-test against.
 *  Walks the parent chain so children of groups end up in absolute coords. */
export function layerAnchorWorldPos(scene: ChronoScene, layer: Layer): Vec2 {
  let x = layer.transform.x + (layer.transform.anchorX ?? 0)
  let y = layer.transform.y + (layer.transform.anchorY ?? 0)
  let cur: Layer | undefined = layer
  while (cur?.parentId) {
    const parent = scene.layers.find((p) => p.id === cur!.parentId)
    if (!parent) break
    x += parent.transform.x
    y += parent.transform.y
    cur = parent
  }
  return { x, y }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape hit-tests
// ─────────────────────────────────────────────────────────────────────────────

/** Point inside an AABB rectangle (inclusive). */
export function pointInRect(p: Vec2, rect: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w
      && p.y >= rect.y && p.y <= rect.y + rect.h
}

/** Point inside a circle (center + radius). */
export function pointInCircle(p: Vec2, c: { x: number; y: number; r: number }): boolean {
  const dx = p.x - c.x
  const dy = p.y - c.y
  return dx * dx + dy * dy <= c.r * c.r
}

/** Point-in-polygon via ray casting. Handles concave shapes. Polygon need
 *  not be closed — the algorithm treats the last → first edge implicitly. */
export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / ((yj - yi) || 1e-9) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk hit-test against scene layers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns ids of every visible, unlocked layer whose anchor falls inside
 *  the rect. */
export function layersInRect(
  scene: ChronoScene,
  rect: { x: number; y: number; w: number; h: number },
): Set<string> {
  const out = new Set<string>()
  for (const layer of scene.layers) {
    if (!isSelectable(layer)) continue
    if (pointInRect(layerAnchorWorldPos(scene, layer), rect)) out.add(layer.id)
  }
  return out
}

/** Returns ids of every visible, unlocked layer whose anchor falls inside
 *  the circle. */
export function layersInCircle(
  scene: ChronoScene,
  circle: { x: number; y: number; r: number },
): Set<string> {
  const out = new Set<string>()
  for (const layer of scene.layers) {
    if (!isSelectable(layer)) continue
    if (pointInCircle(layerAnchorWorldPos(scene, layer), circle)) out.add(layer.id)
  }
  return out
}

/** Returns ids of every visible, unlocked layer whose anchor falls inside
 *  the polygon. */
export function layersInPolygon(scene: ChronoScene, polygon: Vec2[]): Set<string> {
  const out = new Set<string>()
  for (const layer of scene.layers) {
    if (!isSelectable(layer)) continue
    if (pointInPolygon(layerAnchorWorldPos(scene, layer), polygon)) out.add(layer.id)
  }
  return out
}

/** Returns ids of every visible, unlocked layer whose anchor is within
 *  `radius` of the cursor — used by the Paint tool every pointermove. */
export function layersUnderPaintBrush(
  scene: ChronoScene,
  cursor: Vec2,
  radius: number,
): Set<string> {
  return layersInCircle(scene, { x: cursor.x, y: cursor.y, r: radius })
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

function isSelectable(layer: Layer): boolean {
  if (layer.hidden) return false
  if (layer.locked) return false
  if ((layer as { frozen?: boolean }).frozen) return false
  if (layer.type === 'audio') return false   // audio has no canvas presence
  return true
}
