// ── Canvas Selection Shape Hit-Test (BL-60 Faz 3) ─────────────────────────────
// Pure helpers used by the canvas Box / Lasso / Circle / Paint selection
// tools. Each `layersInX` accepts a SelectionContainMode:
//
//   'inside'   → layer's bounding box must lie FULLY within the shape
//                (3ds Max "Window" selection, AutoCAD "Window")
//   'touching' → layer's bounding box must INTERSECT the shape — even
//                touching a single edge counts (3ds Max "Crossing")
//
// Touching is the more permissive default that matches Figma's marquee.
// Inside is the stricter pick-the-fully-enclosed-objects mode.

import type { ChronoScene, Layer } from '../types'
import { evaluateTimelines, type OverrideMap } from '../evaluator'
import { resolveLayerWorldBounds, createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import type { PathBounds } from '../geometry/computePathBounds'

interface Vec2 { x: number; y: number }
interface AABB { x: number; y: number; w: number; h: number }

/** Containment mode for canvas selection tools (BL-60 Faz 3). */
export type SelectionContainMode = 'inside' | 'touching'

/** One borrowed evaluated frame for composition-space selection. Supply the
 * canvas's overrides when timeline isolation, parameters or runtime bindings
 * affect its display. With timeMs alone, ordinary timelines are evaluated.
 * Omitting both fields preserves legacy static/source selection semantics.
 * Inputs remain immutable for the synchronous query; no cache is retained. */
export interface SelectionFrameOptions {
  timeMs?: number
  overrides?: OverrideMap
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer position helpers
// ─────────────────────────────────────────────────────────────────────────────

/** World position of a layer's anchor point. Walks the parent chain so
 *  children of groups end up in absolute coords. */
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

/** Return editable geometry bounds in composition pixels, including evaluated
 * parents, vectors and instances. Omitted frame keeps the legacy static view.
 * Unsupported/empty geometry retains a 1×1 box at its evaluated local origin;
 * input scene, overrides and geometry are never mutated. */
export function getLayerWorldBounds(scene: ChronoScene, layer: Layer, options: SelectionFrameOptions = {}): AABB {
  const { timeMs, overrides } = resolveSelectionFrame(scene, options)
  const b = resolveLayerWorldBounds(layer, scene, timeMs, overrides)
  return asSelectionBounds(scene, layer, b, timeMs, overrides)
}

/** Adapt canonical bounds to selection's historical width/height names and
 * unsupported-geometry fallback, using the same frame for both branches. */
function asSelectionBounds(scene: ChronoScene, layer: Layer, b: PathBounds | null, timeMs: number, overrides: OverrideMap): AABB {
  if (b) {
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  }
  const { x, y } = resolveLayerWorldMatrix(layer, scene, timeMs, overrides).applyToPoint({ x: 0, y: 0 })
  return { x, y, w: 1, h: 1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point-in-shape primitives
// ─────────────────────────────────────────────────────────────────────────────

export function pointInRect(p: Vec2, rect: AABB): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w
      && p.y >= rect.y && p.y <= rect.y + rect.h
}

export function pointInCircle(p: Vec2, c: { x: number; y: number; r: number }): boolean {
  const dx = p.x - c.x
  const dy = p.y - c.y
  return dx * dx + dy * dy <= c.r * c.r
}

/** Point-in-polygon via ray casting. Handles concave shapes. */
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
// AABB-shape relations — used to support both 'inside' and 'touching' modes
// ─────────────────────────────────────────────────────────────────────────────

/** True when `inner` is fully contained within `outer` (edges may touch). */
export function rectInsideRect(inner: AABB, outer: AABB): boolean {
  return inner.x >= outer.x
      && inner.y >= outer.y
      && inner.x + inner.w <= outer.x + outer.w
      && inner.y + inner.h <= outer.y + outer.h
}

/** True when two AABBs overlap (touching counts). */
export function rectIntersectsRect(a: AABB, b: AABB): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  )
}

function rectCorners(r: AABB): Vec2[] {
  return [
    { x: r.x,         y: r.y         },
    { x: r.x + r.w,   y: r.y         },
    { x: r.x + r.w,   y: r.y + r.h   },
    { x: r.x,         y: r.y + r.h   },
  ]
}

/** All 4 corners of `rect` lie inside `circle`. */
export function rectInsideCircle(rect: AABB, circle: { x: number; y: number; r: number }): boolean {
  return rectCorners(rect).every((c) => pointInCircle(c, circle))
}

/** Closest-point-to-rect distance to circle center is ≤ radius. */
export function rectIntersectsCircle(rect: AABB, circle: { x: number; y: number; r: number }): boolean {
  const cx = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w))
  const cy = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h))
  const dx = circle.x - cx
  const dy = circle.y - cy
  return dx * dx + dy * dy <= circle.r * circle.r
}

/** All 4 corners of `rect` lie inside `polygon`. */
export function rectInsidePolygon(rect: AABB, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false
  return rectCorners(rect).every((c) => pointInPolygon(c, polygon))
}

/** Polygon and rect overlap: any rect corner inside polygon, any polygon
 *  vertex inside rect, or any edge pair crosses. */
export function rectIntersectsPolygon(rect: AABB, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false
  const corners = rectCorners(rect)
  if (corners.some((c) => pointInPolygon(c, polygon))) return true
  if (polygon.some((p) => pointInRect(p, rect))) return true
  const edges: [Vec2, Vec2][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ]
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n]
    for (const [c, d] of edges) {
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}

/** True when segments p1→p2 and p3→p4 cross. Endpoints touching = true. */
export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y)
  if (Math.abs(denom) < 1e-9) return false
  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk hit-tests against scene layers (with mode parameter)
// ─────────────────────────────────────────────────────────────────────────────

/** Select non-audio, visible, unlocked, unfrozen layers by composition-pixel
 * rectangle bounds. Results preserve scene order and source/override inputs.
 * Frame options are optional for backward-compatible static callers. */
export function layersInRect(
  scene: ChronoScene,
  rect: AABB,
  mode: SelectionContainMode = 'touching',
  frame: SelectionFrameOptions = {},
): Set<string> {
  return selectLayersByBounds(scene, frame, bounds => mode === 'inside'
    ? rectInsideRect(bounds, rect) : rectIntersectsRect(bounds, rect))
}

/** Select layers whose evaluated bounds meet a composition-pixel circle.
 * Containment, ordering, flags and ownership match layersInRect. */
export function layersInCircle(
  scene: ChronoScene,
  circle: { x: number; y: number; r: number },
  mode: SelectionContainMode = 'touching',
  frame: SelectionFrameOptions = {},
): Set<string> {
  return selectLayersByBounds(scene, frame, bounds => mode === 'inside'
    ? rectInsideCircle(bounds, circle) : rectIntersectsCircle(bounds, circle))
}

/** Select layers by composition-pixel lasso polygon and evaluated bounds.
 * Fewer than three polygon points select nothing; inputs are never mutated. */
export function layersInPolygon(
  scene: ChronoScene,
  polygon: Vec2[],
  mode: SelectionContainMode = 'touching',
  frame: SelectionFrameOptions = {},
): Set<string> {
  return selectLayersByBounds(scene, frame, bounds => mode === 'inside'
    ? rectInsidePolygon(bounds, polygon) : rectIntersectsPolygon(bounds, polygon))
}

/** Select layers touched by a composition-pixel paint brush in one frame.
 * Always uses touching semantics; caller owns accumulation across samples. */
export function layersUnderPaintBrush(
  scene: ChronoScene,
  cursor: Vec2,
  radius: number,
  frame: SelectionFrameOptions = {},
): Set<string> {
  return layersInCircle(scene, { x: cursor.x, y: cursor.y, r: radius }, 'touching', frame)
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve once per query. Explicit overrides are authoritative, including an
 * empty map; legacy callers never begin evaluating timelines implicitly. */
function resolveSelectionFrame(scene: ChronoScene, options: SelectionFrameOptions): { timeMs: number; overrides: OverrideMap } {
  const timeMs = options.timeMs ?? 0
  return { timeMs, overrides: options.overrides
    ?? (options.timeMs === undefined ? new Map() : evaluateTimelines(scene.timelines, timeMs)) }
}

/** Share frame evaluation and canonical bounds preparation across one query. */
function selectLayersByBounds(scene: ChronoScene, options: SelectionFrameOptions, matches: (bounds: AABB) => boolean): Set<string> {
  const { timeMs, overrides } = resolveSelectionFrame(scene, options)
  const boundsForFrame = createLayerWorldBoundsResolver(scene, timeMs, overrides)
  const out = new Set<string>()
  for (const layer of scene.layers) {
    if (!isSelectable(layer, overrides)) continue
    if (matches(asSelectionBounds(scene, layer, boundsForFrame(layer), timeMs, overrides))) out.add(layer.id)
  }
  return out
}

/** Preserve per-layer selection exclusions, using evaluated boolean flags
 * when supplied by the displayed frame. Group/child scope remains caller-owned. */
function isSelectable(layer: Layer, overrides: OverrideMap): boolean {
  for (const flag of ['hidden', 'locked', 'frozen'] as const) {
    const value = overrides.get(`layers.${layer.id}.${flag}`)
    if (typeof value === 'boolean' ? value : layer[flag]) return false
  }
  if (layer.type === 'audio') return false   // audio has no canvas presence
  return true
}
